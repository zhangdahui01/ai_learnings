"""Agent runner: hands agent tasks from the outbox to the agent runtime the user chose.

A task = {agent, task, context}. The runner composes
  system prompt = agents/<agent>.md            (who the agent is and its rules)
  user prompt   = prompts/<template>.md         (the job, stack specific) + task + context + output contract
and runs the command configured in config/agent_runtime.json (default: Claude Code headless).
Without --run it only writes the composed prompt to var/agent_runs/, so any runtime or a person
can take it from there.
"""
from __future__ import annotations

import json
import re
import shlex
import subprocess
import time
from pathlib import Path
from typing import Any

from workflows.common import ROOT

DEFAULT_RUNTIME = {
    "command": ["claude", "-p", "{prompt}", "--append-system-prompt", "{system}", "--output-format", "json",
                "--permission-mode", "acceptEdits", "--allowedTools", "{tools}"],
    "cwd": ".",
    "timeout_s": 1800,
    "tools": {
        "default": "Read,Grep,Glob",
        "planner": "Read,Grep,Glob,Write",
        "case-author": "Read,Grep,Glob,Write,Edit,Bash",
        "healer": "Read,Grep,Glob,Edit,Bash",
        "case-auditor": "Read,Grep,Glob,Bash",
        "gate-triage": "Read,Grep,Glob,Bash",
        "farm-doctor": "Read,Grep,Glob,Bash",
        "onboarding": "Read,Grep,Glob,Write,Bash"
    },
    "mcp_config": None
}
TEMPLATES = {            # (agent, stack) -> prompts/<file>; stack None = any
    ("planner", None): "plan-spec.md",
    ("case-author", "web"): "author-web.md",
    ("case-author", "app"): "author-app.md",
    ("case-auditor", None): "audit-case.md",
    ("healer", "web"): "heal-web.md",
    ("healer", "app"): "heal-app.md",
    ("gate-triage", None): "triage-gate.md",
    ("farm-doctor", None): "farm-doctor.md",
    ("onboarding", None): "onboard-service.md",
}
RESULT_BLOCK = re.compile(r"```json\s*(\{.*?\})\s*```", re.S)


def runtime(path: Path | None = None) -> dict[str, Any]:
    path = path or ROOT / "config" / "agent_runtime.json"
    cfg = dict(DEFAULT_RUNTIME)
    if path.exists():
        cfg.update(json.loads(path.read_text()))
    return cfg


def _body(markdown: str) -> str:
    return re.sub(r"\A---\n.*?\n---\n", "", markdown, flags=re.S).strip()


def stack_of(task: dict[str, Any]) -> str | None:
    ctx = task.get("context", {})
    stack = ctx.get("stack") or (ctx.get("input") or {}).get("stack")
    if not stack:
        stacks = {f.get("stack") for f in ctx.get("failures", []) if f.get("stack")}
        stack = stacks.pop() if len(stacks) == 1 else None
    if not stack and "framework" in ctx:
        stack = "app" if "Appium" in ctx["framework"] else "web"
    return stack


def compose(task: dict[str, Any]) -> dict[str, str]:
    agent = task["agent"]
    stack = stack_of(task)
    template = TEMPLATES.get((agent, stack)) or TEMPLATES.get((agent, None)) or TEMPLATES.get((agent, "web"))
    system = _body((ROOT / "agents" / f"{agent}.md").read_text())
    job = _body((ROOT / "prompts" / template).read_text()) if template else ""
    contract = _body((ROOT / "prompts" / "output-contract.md").read_text())
    prompt = "\n\n".join([
        job,
        f"## This task\n\n{task['task']}",
        f"## Context\n\n```json\n{json.dumps(task.get('context', {}), indent=2, ensure_ascii=False, default=str)}\n```",
        contract.replace("{task_id}", task["id"]).replace("{module}", task.get("module", "")),
    ]).strip()
    return {"system": system, "prompt": prompt, "template": template or "", "stack": stack or ""}


def pending(outbox: Path, runs: Path, agent: str | None = None) -> list[dict[str, Any]]:
    tasks = [json.loads(p.read_text()) for p in sorted((outbox / "agent_task").glob("*.json"))]
    tasks.sort(key=lambda t: t["ts"])
    return [t for t in tasks if not (runs / f"{t['id']}.json").exists() and (agent is None or t["agent"] == agent)]


def run_task(task: dict[str, Any], runs: Path, *, execute: bool = False, cfg: dict[str, Any] | None = None,
             runner=subprocess.run) -> dict[str, Any]:
    cfg = cfg or runtime()
    parts = compose(task)
    runs.mkdir(parents=True, exist_ok=True)
    (runs / f"{task['id']}.prompt.md").write_text(
        f"<!-- agent: {task['agent']} | template: {parts['template']} | stack: {parts['stack']} -->\n"
        f"# System\n\n{parts['system']}\n\n# Prompt\n\n{parts['prompt']}\n")
    record: dict[str, Any] = {"task_id": task["id"], "agent": task["agent"], "template": parts["template"],
                              "prompt_file": str(runs / f"{task['id']}.prompt.md"), "executed": False}
    if not execute:
        return record                      # composed only: nothing is marked as done
    tools = cfg["tools"].get(task["agent"], cfg["tools"]["default"])
    argv = [a.replace("{prompt}", parts["prompt"]).replace("{system}", parts["system"]).replace("{tools}", tools)
            for a in cfg["command"]]
    if cfg.get("mcp_config"):
        argv += ["--mcp-config", cfg["mcp_config"]]
    started = time.time()
    try:
        proc = runner(argv, cwd=str((ROOT / cfg.get("cwd", ".")).resolve()), capture_output=True, text=True,
                      timeout=cfg.get("timeout_s", 1800))
        output, code = proc.stdout, proc.returncode
        error = proc.stderr[-2000:] if code else ""
    except FileNotFoundError:
        output, code, error = "", 127, f"agent runtime not found: {shlex.quote(argv[0])}"
    except subprocess.TimeoutExpired:
        output, code, error = "", 124, f"agent runtime timed out after {cfg.get('timeout_s')}s"
    text = output
    try:                                    # Claude Code --output-format json wraps the answer in {"result": ...}
        text = json.loads(output).get("result", output)
    except (ValueError, AttributeError):
        pass
    match = RESULT_BLOCK.findall(text or "")
    result = None
    if match:
        try:
            result = json.loads(match[-1])
        except ValueError:
            result = None
    record.update(executed=True, exit_code=code, error=error, seconds=round(time.time() - started, 1),
                  result=result, raw=(text or "")[-6000:])
    (runs / f"{task['id']}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record


def run_pending(var: Path, *, execute: bool = False, agent: str | None = None, limit: int | None = None,
                runner=subprocess.run) -> list[dict[str, Any]]:
    runs = var / "agent_runs"
    tasks = pending(var / "outbox", runs, agent)[:limit]
    return [run_task(t, runs, execute=execute, runner=runner) for t in tasks]
