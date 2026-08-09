# Open-source landscape

## Recommendation

Use **Microsoft Playwright** as the primary recorder/replay engine and build the local test-plan UI and persistence around it. It is actively maintained, Apache-2.0, has a recorder/codegen, locator generation, action/assertion APIs, trace/video/screenshot artifacts, browser-context proxy support, and one API for Chromium, Firefox, and WebKit.

Add a narrow **Selenium WebDriver Safari adapter** only if the product must launch and automate the real Apple Safari browser. Do not describe Playwright WebKit as Safari.

## Candidate repositories

| Repository | Reusable strengths | Gaps against this product | Borrowing decision |
|---|---|---|---|
| [microsoft/playwright](https://github.com/microsoft/playwright) (Apache-2.0) | Modern browser API, codegen/Inspector, locators, assertions, proxy/context configuration, Chromium/Firefox/WebKit, traces | No ready-made test-plan CRUD product; WebKit is not Apple Safari | Adopt as runtime dependency; use public APIs. Avoid coupling to internal recorder protocol. |
| [SeleniumHQ/selenium-ide](https://github.com/SeleniumHQ/selenium-ide) (Apache-2.0) | Electron + React desktop UX, `.side` model, test/suite editing, WebExtension recording, local playback, multi-language export | Recorder targets browser-extension channels, not Safari; UI architecture is legacy/heavier; not a modern Playwright runner | Study/fork only if `.side` compatibility or its complete desktop editor is a firm requirement. Preserve notices. |
| [SeleniumHQ/selenium](https://github.com/SeleniumHQ/selenium) (Apache-2.0) | W3C WebDriver and SafariDriver integration path; broad browser capability model | No comparable modern recorder/product UI or built-in rich artifact story | Use only behind an adapter for real Safari and existing WebDriver environments. |
| [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) (Apache-2.0) | Recent command-line patterns for recording/generating code and browser/proxy configuration | CLI, not a test-management application; generated actions alone do not provide product schema | Borrow configuration conventions or invoke it during prototyping; do not make it the product's persistence layer. |
| [rrweb-io/rrweb](https://github.com/rrweb-io/rrweb) (MIT) | DOM/session visual replay | Not deterministic test automation; cannot replace Playwright/WebDriver cases or assertions | Optional diagnostic/session-replay feature only; never runner core. |

## Evidence and practical interpretation

- Playwright's official codegen documentation records click/fill-style actions, can capture visibility/text/value assertions, and supplies a locator picker. This directly covers the recording primitive, but an application must add the editable plan/case/data model.
- Selenium IDE describes itself as an Electron application for recording and playback, with a TypeScript/React monorepo and packages for model, runner, and code export. It is the closest full product reference for plan/case editing UX.
- Playwright exposes Chromium, Firefox, and WebKit; Apple Safari compatibility should be treated separately. Selenium WebDriver is the appropriate compatibility boundary for SafariDriver.

## Repository evaluation result

No active open-source repository found provides every requested capability as one local product: editable test plans and test cases, modern structured recording/assertion authoring, reliable replay, proxy setup, Chrome/Firefox, and **real Safari**. The appropriate approach is composition rather than a wholesale fork:

1. Depend on Playwright for recording/replay and artifacts.
2. Implement local test-plan management and structured persistence.
3. Add a WebDriver adapter where real Safari is a stated acceptance criterion.
4. Consider importing/exporting Selenium IDE `.side` only if migration interoperability is required.
