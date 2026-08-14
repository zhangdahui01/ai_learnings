#!/usr/bin/env python3
"""Validate the minimal persisted test-case contract without dependencies."""

import json
import sys
from pathlib import Path

ACTIONS = {
    "goto", "back", "forward", "reload", "newPage", "switchPage", "closePage",
    "click", "rightClick", "dblclick", "tap", "hover", "focus", "press", "keyDown", "keyUp", "scroll",
    "scrollDown", "scrollUp", "scrollLeft", "scrollRight", "scrollToElement", "scrollToTop", "scrollToBottom",
    "swipeLeft", "swipeRight", "swipeUp", "swipeDown", "dragTo", "mouseMove", "fill", "clear", "type", "selectText", "setInputFiles",
    "acceptDialog", "dismissDialog", "clickAndSwitchPage", "clickAndWaitForDownload", "pageScreenshot", "elementScreenshot",
    "keyboardType", "mouseDown", "mouseUp", "mouseClick", "dispatchEvent", "extractText",
    "check", "uncheck", "selectOption", "chooseRadio", "setSliderValue",
    "selectAutocompleteOption", "expandTreeNode", "collapseTreeNode", "selectGridRow",
    "dismissDialog", "acceptDialog", "waitForVisible", "waitForHidden", "waitForURL",
    "waitForLoadState", "waitForDownload", "extractText", "switchFrame",
    "switchMainFrame", "pierceShadow",
}
ASSERTIONS = {
    "toBeVisible", "toBeHidden", "toBeEnabled", "toBeDisabled", "toBeChecked",
    "toBeAttached", "toBeEditable", "toBeEmpty", "toBeFocused", "toBeInViewport",
    "toHaveText", "toContainText", "toHaveValue", "toHaveValues", "toHaveAttribute", "toHaveClass", "toContainClass",
    "toHaveCSS", "toHaveId", "toHaveJSProperty", "toHaveAccessibleName", "toHaveAccessibleDescription", "toHaveAccessibleErrorMessage", "toHaveRole", "toMatchAriaSnapshot",
    "toHavePageCount", "toHaveDownloadFilename", "toHaveDialogMessage", "toHaveResponseStatus", "toHaveStoredValue",
    "toHaveCount", "toHaveURL", "toHaveTitle", "toMatchScreenshot", "toHaveDownload",
    "toHaveResponseStatus",
}
BROWSERS = {"chromium", "chrome", "firefox", "webkit", "safari"}


def fail(errors, message):
    errors.append(message)


def validate(case):
    errors = []
    if not isinstance(case, dict):
        return ["root must be an object"]
    for field in ("schemaVersion", "id", "name", "steps"):
        if field not in case:
            fail(errors, f"missing required field: {field}")
    if case.get("schemaVersion") != 1:
        fail(errors, "schemaVersion must be 1")
    if not isinstance(case.get("id"), str) or not case.get("id", "").strip():
        fail(errors, "id must be a non-empty string")
    if not isinstance(case.get("name"), str) or not case.get("name", "").strip():
        fail(errors, "name must be a non-empty string")
    defaults = case.get("defaults", {})
    if defaults and not isinstance(defaults, dict):
        fail(errors, "defaults must be an object")
    elif defaults.get("browser") and defaults["browser"] not in BROWSERS:
        fail(errors, f"unsupported browser: {defaults['browser']}")
    steps = case.get("steps")
    if not isinstance(steps, list) or not steps:
        fail(errors, "steps must be a non-empty array")
        return errors
    seen = set()
    for index, step in enumerate(steps, start=1):
        prefix = f"steps[{index}]"
        if not isinstance(step, dict):
            fail(errors, f"{prefix} must be an object")
            continue
        step_id = step.get("id")
        if not isinstance(step_id, str) or not step_id:
            fail(errors, f"{prefix}.id must be a non-empty string")
        elif step_id in seen:
            fail(errors, f"duplicate step id: {step_id}")
        else:
            seen.add(step_id)
        kind = step.get("kind")
        if kind == "action":
            if step.get("action") not in ACTIONS:
                fail(errors, f"{prefix}.action is unsupported")
        elif kind == "assertion":
            if step.get("assertion") not in ASSERTIONS:
                fail(errors, f"{prefix}.assertion is unsupported")
        else:
            fail(errors, f"{prefix}.kind must be action or assertion")
        timeout = step.get("timeoutMs")
        if timeout is not None and (not isinstance(timeout, int) or timeout <= 0):
            fail(errors, f"{prefix}.timeoutMs must be a positive integer")
        locator = step.get("locator")
        if locator is not None and (not isinstance(locator, dict) or not isinstance(locator.get("primary"), dict)):
            fail(errors, f"{prefix}.locator must include a primary locator object")
    return errors


def main():
    if len(sys.argv) != 2:
        print(f"usage: {Path(sys.argv[0]).name} CASE.json", file=sys.stderr)
        return 2
    try:
        case = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid input: {exc}", file=sys.stderr)
        return 2
    errors = validate(case)
    if errors:
        print("INVALID")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"VALID: {case['id']} ({len(case['steps'])} steps)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
