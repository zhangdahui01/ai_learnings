#!/usr/bin/env python3
"""Small, read-only preflight scanner for agent skills."""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

def finding(items, ident, sev, path, evidence, impact, remediation):
    items.append({"id": ident, "severity": sev, "file": str(path), "evidence": evidence,
                  "impact": impact, "remediation": remediation, "status": "open"})

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("artifact", type=Path)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--min-score", type=int, default=80)
    args = ap.parse_args()
    root = args.artifact.resolve()
    findings = []
    if not root.is_dir():
        finding(findings, "STR-000", "Critical", root, "artifact is not a directory", "Cannot audit target", "Pass a skill directory")
    else:
        skill = root / "SKILL.md"
        if not skill.is_file():
            finding(findings, "STR-001", "Critical", skill, "SKILL.md missing", "Agent cannot reliably discover the skill", "Add SKILL.md with YAML frontmatter")
        else:
            text = skill.read_text(encoding="utf-8", errors="replace")
            if not text.startswith("---") or "name:" not in text.split("---", 2)[1] or "description:" not in text.split("---", 2)[1]:
                finding(findings, "STR-001", "High", skill, "frontmatter lacks name or description", "Discovery and activation are ambiguous", "Add valid YAML frontmatter")
            for ident, pattern, sev, impact in [
                ("SEC-001", r"(?i)(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----)", "Critical", "Credential material may be exposed"),
                ("SEC-002", r"(?i)(ignore previous instructions|exfiltrat|send.*secret|disable.*safety|bypass.*approval)", "Critical", "Embedded instructions may hijack the agent"),
                ("CODE-001", r"(?i)(rm\s+-rf|curl[^\n]*(?:\||;)|wget[^\n]*(?:\||;)|eval\(|exec\()", "High", "Unbounded or unsafe execution may occur"),
            ]:
                if re.search(pattern, text):
                    finding(findings, ident, sev, skill, f"pattern matched: {pattern}", impact, "Remove, constrain, or explicitly gate the behavior and add a test")
            required = ["input", "output", "fail", "approval", "evidence"]
            missing = [word for word in required if word not in text.lower()]
            if missing:
                finding(findings, "QUAL-001", "Medium", skill, "missing concepts: " + ", ".join(missing), "Users may not know the contract or safe fallback", "Document input/output, failure, approval, and evidence rules")
        for p in root.rglob("*"):
            if p.is_symlink():
                finding(findings, "SEC-003", "High", p, "symlink found", "Audit scope may escape the skill directory", "Remove symlink or document and constrain its target")
    weights = {"Critical": 40, "High": 20, "Medium": 8, "Low": 2, "Info": 0}
    score = max(0, 100 - sum(weights[x["severity"]] for x in findings))
    decision = "BLOCK" if any(x["severity"] in {"Critical", "High"} for x in findings) else ("PASS_WITH_WARNINGS" if score < args.min_score else "PASS")
    report = {"audit_version": "1.0", "artifact": str(root), "scope": "read-only preflight", "decision": decision, "score": score, "findings": findings}
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else f"{decision}: score={score}, findings={len(findings)}")
    return 1 if decision == "BLOCK" or score < args.min_score else 0

if __name__ == "__main__":
    raise SystemExit(main())
