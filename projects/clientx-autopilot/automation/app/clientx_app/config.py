"""Device profiles -> Appium capabilities. ${VAR} and ${VAR:-default} come from the environment."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

CONFIG = Path(__file__).resolve().parent.parent / "config" / "devices.json"
_VAR = re.compile(r"\$\{(\w+)(?::-([^}]*))?\}")


class MissingSetting(Exception):
    pass


def _expand(value: Any, env: dict[str, str], missing: list[str]) -> Any:
    if isinstance(value, dict):
        return {k: _expand(v, env, missing) for k, v in value.items()}
    if not isinstance(value, str):
        return value

    def sub(m: re.Match) -> str:
        name, default = m.group(1), m.group(2)
        if name in env:
            return env[name]
        if default is None:
            missing.append(name)
            return ""
        return default
    return _VAR.sub(sub, value)


def load(profile: str, env: dict[str, str] | None = None, path: Path = CONFIG) -> dict[str, Any]:
    """Return {"platform", "server", "capabilities"} for a profile; fail on unset required variables."""
    env = dict(os.environ if env is None else env)
    raw = json.loads(path.read_text())
    if profile not in raw["profiles"]:
        raise KeyError(f"unknown device profile '{profile}'; choose from {sorted(raw['profiles'])}")
    spec = raw["profiles"][profile]
    missing: list[str] = []
    caps = _expand(spec["capabilities"], env, missing)
    caps.update(_expand(raw["app"].get(spec["platform"], {}), env, missing))
    caps = {k: v for k, v in caps.items() if v != ""}          # optional capabilities left empty are dropped
    if missing:
        raise MissingSetting(f"profile '{profile}' needs these environment variables: {sorted(set(missing))}")
    for key in ("appium:systemPort", "appium:wdaLocalPort"):
        if key in caps:
            caps[key] = int(caps[key])
    return {"profile": profile, "platform": spec["platform"],
            "server": _expand(raw["appium_server"], env, []), "capabilities": caps}
