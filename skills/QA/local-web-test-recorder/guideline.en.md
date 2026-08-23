# Local Web Test Recorder: Beginner Guide

## Convert manual Excel cases to BDD and Playwright jobs

Open **BDD Case Center** and import an unencrypted multi-sheet `.xlsx`. Sheets remain in workbook order. Within each sheet, rows are grouped by the effective `Depth1 + Depth2 + Depth3 + Pre-requisite`: matching rows become one BDD case, IDs compact to forms such as `MAIN_001_002`, and every source row remains traceable. The original Pre-requisite is Given. For example, `AB Key [AB ID] is A/B` is also structured into the Spec as `- AB: [AB ID] = A/B`. Each Excel Step stays paired with the Expected Result from the same row in an editable When/Then card; pairs can be reordered, added, or removed without separating actions from outcomes. The default functionName is `[Depth1][Depth2][Depth3][Pre-requisite][first Step]`.

Build separate READY graphs for development, component/Page Object, and existing automation repositories. Graphify is recommended, with the built-in local graph as a fallback. In the generation dialog, choose one output repository for `specs/` and `tests/`, then multi-select one or more reference graphs; the output graph is always included and all other repositories remain read-only. Approved BDD and at least one graph are mandatory; Codegen recordings are optional evidence.

### Complete BDD generation and acceptance workflow

1. In **BDD review center**, review each grouped case by sheet, all source rows, metadata, Given, paired When/Then steps, suitability score, and blockers. Approve and Reject open an in-page review dialog; rejection requires a reason, and overriding blockers requires an explicit checkbox and explanation. The selected sheet/case remains visible after success, and only `approved` enables generation.
2. In **Repository knowledge graph**, build or refresh a READY graph for every local repository you need. Choose one output repository and multiple reference graphs when creating the job.
3. Click **Generate Playwright script** and choose automatic or manual replay, whether failures enter the Agent repair queue, the maximum replay/repair attempts, Generator Agent usage, and optional Codegen scripts.
4. After creation, copy the runtime-specific `agentInstruction` shown by the page into the current Codex, Claude Code, or Devin Agent. By Job ID, the Agent reads the approved BDD, matched paths/terms from every selected repository, and optional recordings; it opens those files to reuse real login/payment/Page Object patterns and submits TypeScript. The web server cannot launch the host Agent across process boundaries.
5. Automatic mode executes the target test immediately after each Agent submission. Manual mode stops at `awaiting-replay` until QA clicks **Start replay**. Trace is always enabled; screenshots and video are collected when produced by the target repository configuration.
6. A failed replay exposes the command, exit code, friendly summary, stdout/stderr, and artifacts. With automatic repair enabled and attempts remaining, the job enters `fix-queued`. The Agent inspects the latest evidence, makes the smallest explainable repair, and resubmits; the platform then replays again.
7. A passing replay enters `awaiting-qa`, not completion. QA reviews the script, assertions, Trace, screenshots/video, and repair history, then supplies a reviewer identity. Only approval changes the status to `signed-off`. Rejection requires a reason and returns the job to repair when attempts remain. An Agent must never sign off for QA.

If the first generation is inaccurate, expand **Generated script** on the job card, edit it, and save it for replay. You can also record a complex flow and add absolute Codegen script paths to the same job; the next generation or repair receives them in its prompt/fix prompt. A `signed-off` job stays immutable—create a new job for later changes.

The primary state flow is `queued → generated → validating → fix-queued → validating → awaiting-qa → signed-off`. Manual replay includes `awaiting-replay`; an exhausted attempt limit ends in `failed`.

The BDD review, repository graph, generation dialog, validation queue, error history, and QA sign-off dialog all follow the top-right locale selector in Chinese, English, and Korean. BDD bodies, immutable Excel source rows, repository paths, code, prompts, and stdout/stderr remain untranslated so audit evidence is never altered.

Local storage used by this workflow:

- `data/store.json`: BDD cases/imports, graph summaries, job state, every replay result, and QA sign-off.
- `data/generation-jobs/<job-id>/`: frozen BDD spec and job audit pack.
- Target repository `specs/<tenant>/<region>/<scenarioId>.md` and `tests/<tenant>/<region>/<scenarioId>.spec.ts`: approved spec and final script.
- `artifacts/generation/<job-id>/attempt-N/`: Trace, screenshots, video, and other Playwright evidence from attempt N.

### Cross-computer installation and migration (personal → work computer / Devin)

The feature has no hard-coded dependency on this computer. Git contains only the Skill, Web application, and reviewed guides; `data/`, target repository source, accounts, and run artifacts are not committed.

1. Clone `ai_learnings` on the work computer, or install `skills/QA/local-web-test-recorder` as `.agents/skills/local-web-test-recorder` in the Devin target repository.
2. Install Node.js 20+ and Git. In `assets/web-test-recorder`, run `npm install`, `npx playwright install`, then `npm run start` or the bundled startup script.
3. Re-import the workbook and build each repository graph from its absolute path on the work computer. Never copy development repositories into the Skill.
4. Approve BDD, select one output repository and multiple reference graphs, then ask Devin: `@skills:local-web-test-recorder process queued Playwright generation jobs, replay, and repair until passing or reaching the limit`.
5. Work-only sites must be validated on the work computer. Personal-computer tests cover Excel grouping, UI/API behavior, multi-graph selection, and queue state, not the corporate network, real accounts, or target site.

To migrate reviewed state, stop both servers and copy only `data/store.json` plus required `data/generation-jobs/`, after checking for sensitive paths. Rebuild every repository graph because absolute paths usually change. Do not copy `node_modules`, browser profiles, or repository clones.

## Contents

1. Capabilities
2. Environment setup
3. Create the application
4. Data storage, backup, and deletion
5. Configuration
6. Record a test case
7. Edit steps and locators
8. Add assertions, waits, and error handling
9. Replay cases and plans
10. Inspect failure evidence
11. Troubleshooting
12. Security and limitations

## 1. Capabilities

The recorder runs on your computer and can:

- Create, edit, and delete test plans.
- Create, edit, and delete test cases and attach/detach them from plans.
- Record browser actions with Playwright Inspector.
- Import generated code as editable structured steps.
- Edit and execute Playwright JavaScript online and generate synchronized Python from steps.
- Map every plan to a folder with one JavaScript and one Python file per case.
- Add assertions, waits, timeouts, retries, and continue-on-error behavior.
- Replay in Chromium/Chrome, Firefox, and WebKit.
- Run complete plans, query/delete run records, and monitor the dashboard.
- Show the failed step, cause, and remediation before raw technical details.
- Preserve screenshots, videos, and Playwright traces on failure.

Local data is stored under the project directory:

- `data/store.json`: plans, cases, and recent run records.
- `recordings/`: code created by Playwright Inspector.
- `test-suites/<plan-name>/`: JavaScript and Python files for each case.
- `artifacts/`: screenshots, videos, and traces.

## 2. Environment setup

### Install Node.js

Install Node.js 20 or a newer LTS release from <https://nodejs.org/>.

Verify it in a terminal:

```bash
node --version
npm --version
```

If either command is missing, reinstall Node.js or reopen the terminal.

### Install dependencies and browsers

Enter the generated project directory:

```bash
cd /absolute/path/to/web-test-recorder
npm install
npx playwright install chromium firefox webkit
```

The first installation requires internet access and may take several minutes.

## 3. Create the application

From the Skill directory, create an independent project:

```bash
node scripts/create_mvp.js /absolute/path/to/web-test-recorder
```

Install and start it:

```bash
cd /absolute/path/to/web-test-recorder
npm install
npx playwright install chromium firefox webkit
node start-server.mjs
```

Open <http://localhost:4173>. Press `Ctrl+C` in the server terminal to stop it. The launcher checks Node.js, npm dependencies, Playwright Chromium, and the port, and appends server output to `data/logs/server.log`. Use `node start-server.mjs --install` when `node_modules` is missing, or `node start-server.mjs --port 4174` to change the port. `npm start` remains the minimal fallback.

## 4. Data storage, backup, and deletion

### Application data

All relative paths are under the generated `web-test-recorder` project directory:

| Path | Content | Notes |
|---|---|---|
| `data/store.json` | Plans, suites, cases, versioned shared flows, lifecycle steps, assertions, test data, settings, and run metadata | Local JSON, not a remote database. Test data may be sensitive. |
| `data/auth/suites/<suite-id>/vN/storage-state.json` | Cookie/localStorage captured by a successful Suite Setup vN recording or replay | Loaded by suite-context case recording. Treat it as a credential and never commit or share it. |
| `data/profiles/`, `data/auth/<case-id>.json` | Compatibility data from the former compliant-recording feature | New recording entry points do not create it; remove it manually only after compatibility is no longer needed. |
| `recordings/*.spec.js` | Raw code generated by Playwright Inspector | Account names, search terms, or other entered values may appear as plain text. |
| `test-suites/<plan-name>/<suite-name>/*.spec.js` | Node.js/Playwright exports generated from current no-code steps | One file per case; runnable from the CLI, but not the immutable original recording. |
| `test-suites/<plan-name>/<suite-name>/test_*.py` | Python/Playwright generated from the same step model | Preserves the same Suite/Case lifecycle and can run separately with pytest-playwright. |
| `test-suites/.../versions/vN/steps.json` | Versioned no-code lifecycle steps and default replay modes | Audit/migration snapshot; do not edit historical files in place. |
| `test-suites/.../versions/vN/generated.spec.js`, `generated.py` | Read-only exports generated from that version's steps | View/download under Advanced; legacy filenames remain for compatibility. |
| `test-suites/<plan-name>/<suite-name>/suite.*` | JavaScript/Python sources for Suite Setup/Teardown | Rebuilt when no-code phases are saved and embedded into executable case files. |
| `test-suites/_公共流程/` | JavaScript/Python for the current version of each shared flow | Synchronized after no-code edits or a new recording. |
| `test-suites/.../versions/vN/recorded.<phase>.spec.js` | Immutable original recording for one phase in vN | `phase` is `setupSteps`, `steps`, or `teardownSteps`; no-code or export-code edits never overwrite it. |
| `test-suites/.../versions/vN/native.<phase>.spec.js` | Editable native JavaScript replay source for one phase in vN | Saving it from Advanced creates a new asset version and never changes `recorded.<phase>.spec.js` or no-code steps. |
| `artifacts/<run-id>/failure.png` | Screenshot of the failed page | May show profiles, orders, accounts, or other page content. |
| `artifacts/<run-id>/trace.zip` | Playwright trace, page snapshots, and network evidence | May contain URLs, DOM content, request information, and entered values. |
| `artifacts/<run-id>/*.webm` | Replay video | May contain the interaction flow and sensitive page content. |

The application binds to local `localhost` by default and does not proactively upload these files. Browser actions naturally send requests to the tested website; dependency installation contacts the npm and Playwright download services.

Run generated code from the project root:

```bash
npm run test:generated
npm run test:generated -- "test-suites/<plan>/<suite>/<case>.spec.js"

# Install pytest-playwright and its browser first.
python3 -m pytest "test-suites/<plan>/<suite>/test_<case>.py"
```

Generated JavaScript carries the case browser, locale, action/navigation timeouts, and proxy server. Proxy credentials are never written to source; provide `WTR_PROXY_USERNAME` / `WTR_PROXY_PASSWORD` on the command line. Override CLI behavior with `WTR_TEST_TIMEOUT`, `WTR_EXPECT_TIMEOUT`, `WTR_BROWSER`, or `WTR_HEADLESS=false`.

### Environment files

- `node_modules/`: project dependencies; rebuild them with `npm install`.
- Playwright browser cache: normally `~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux, and `%USERPROFILE%\AppData\Local\ms-playwright` on Windows.
- Standard recording and every replay use a fresh session by default and inherit no cookies, cache, Local/Session Storage, or IndexedDB.
- Suite-context recording uses `data/auth/suites/<suite-id>/vN/storage-state.json`; protect and clear these files as credentials.
- `data/profiles/` and `data/auth/<case-id>.json` are retained only for compatibility with older releases.
- The Skill itself: normally `~/.codex/skills/local-web-test-recorder/`.

### Git and sharing

The template `.gitignore` excludes:

```text
data/store.json
data/profiles/
data/auth/
recordings/
artifacts/
node_modules/
```

Do not force-add these paths. Review and redact traces, screenshots, videos, and generated recordings before sharing them.

### Backup

1. Press `Ctrl+C` in the server terminal to stop the application.
2. Back up `data/store.json`.
3. Back up `recordings/` and `artifacts/` when raw recordings and diagnostic evidence are required.
4. Restore the files to the same project-relative paths before restarting the server.

### Deletion and retention

- Deleting a plan or case in the UI only updates `data/store.json`.
- Deleting a plan does not automatically delete its cases.
- Deleting a case does not automatically delete old recordings, run metadata, screenshots, videos, or traces.
- The Runs page can delete one record or clear run metadata, but files under `artifacts/` are not automatically purged.
- Stop the server before cleanup, then use Finder/File Explorer to delete explicitly selected recording files or a specific `artifacts/<run-id>` directory.

## 5. Configuration

### Browser

- `Chrome / Chromium`: default and suitable for most sites.
- `Firefox`: verify Firefox compatibility.
- `WebKit`: verify the WebKit engine; this is not the Apple Safari application.

### Page locale

Use a BCP 47 locale such as:

- `zh-CN`: Simplified Chinese.
- `en-US`: US English.
- `ko-KR`: Korean.

Use the same locale for recording and replay. Role locators keep the exact accessible name and fail when it is absent; the runner never clicks an arbitrary same-role element because that can create false passes.

### Platform interface language (中文 / English / 한국어)

Use **Interface language** in the top-right corner to switch the platform UI among Chinese, English, and Korean. Navigation, dashboard, plans/cases/runs, step editing, advanced waits, settings, recording dialogs, toasts, confirmations, and friendly error messages update immediately. The selection persists after a reload or reopening the application.

The choice is stored only in the current browser's `localStorage` under `coupayWeb.uiLocale`. It is not written to `data/store.json` and is not exported with plans. Clearing site data or running `localStorage.removeItem('coupayWeb.uiLocale')` restores the default Chinese UI.

Keep the two settings distinct: the top-right selector controls the platform interface; **Settings & data → Test page locale** controls the Playwright locale of the target website. Switching the interface never rewrites recorded code, accessible names, test data, or the target page locale.

### Start URL

Use a complete URL such as `https://example.com/login`, including `https://`.

### Test data

“Test account (name/reference)” is an auditable alias such as `accounts.qa-buyer`; it neither reads a password nor fills a form. Put variable values in Test data JSON:

```json
{
  "account": { "username": "qa-user@example.com" },
  "searchText": "playwright tutorial"
}
```

Use `${data.searchText}` or nested `${data.account.username}` in no-code URLs, values, and expectations. Generated JS/Python keeps the same references and resolves them from `WTR_TEST_DATA` at replay. Use `${env.COUPAY_PASSWORD}` for secrets and set that environment variable before starting the server. Never put production passwords, tokens, or one-time codes in JSON, source, or recordings.

### Recording snapshot, native replay code, no-code steps, and exports

- The original recording snapshot is stored read-only by asset, phase, and version after Inspector closes. It is permanent audit/recovery evidence and is never overwritten.
- Native replay JavaScript starts from that snapshot and is editable under Advanced. For example, if record-after-manual-login did not trim correctly, remove the statements before the login boundary. Saving creates a new asset version, changes only that phase's native replay source, and makes native replay its default.
- No-code steps are a best-effort import for beginners to review, edit, and enrich with waits or assertions. Saving them updates only structured steps and regenerates their JS/Python exports.
- Exported JavaScript/Python is generated from no-code steps for CLI execution, review, and development. It remains read-only and never changes no-code, native replay code, or the original snapshot.
- Historical cases without an original-recording field continue to run their existing no-code steps. A legacy code-only case with no structured steps falls back to its existing JavaScript. Migration never mislabels generated legacy code as an original recording.
- The ordinary page avoids a confusing generic Code Editor tab. Advanced provides the editable native replay source, immutable snapshot, and read-only exports. “Copy as custom code case” is no longer exposed because it could create a confusing extra empty case; existing historical custom-code cases remain editable.
- Version history shows the default replay mode for every Case Setup/body/Teardown phase (or the matching Suite/shared-flow phase). **Native code** runs that version's `native.<phase>.spec.js` by default. **No-code steps** runs structured steps. **No-code steps (native available)** means no-code is the default, while the replay dialog can still select native code manually.

The UI exposes only two execution sources: **Replay native code** and **Replay current steps**. The recording snapshot is evidence and generated JS/Python is only a file representation of no-code, so neither is a third user-facing business version. Editing no-code never proactively overwrites native replay code.

### Recording and replaying iframe pages

The importer recognizes both `page.frameLocator(...)` and `page.locator(...).contentFrame()` emitted by Playwright Inspector. It converts them into Enter frame → in-frame actions/assertions → Return to main page. Do not put the iframe CSS selector into the locator field of a button or input inside that frame.

- For one iframe, set Enter frame to a CSS selector such as `#payment-frame`; locate the next control with role + accessible name, label, text, or test ID.
- For nested iframes, use an outer-to-inner JSON path such as `["#outer-frame","iframe[name=checkout]"]`.
- Add Return to main page before operating on the top-level page. Automatic import adds it when the recorded chain switches back to `page`.
- Every case or suite phase starts in the main-page context. Run details display `iframe: outer → inner` for easier diagnosis.
- For dynamically loaded frames, add `waitForVisible` or automatic element readiness to the first in-frame element instead of relying only on fixed delays.

Generated JavaScript uses `frameScope(page, framePath)` and Python uses `frame_scope(page, frame_path)`, so no-code, JavaScript, and Python share the same frame path.

### Common action and assertion reference

Suite Setup/Teardown, shared flows, and all three case phases use the same searchable Steps/Assertions guide. Filter it by navigation, forms, waits, dialogs, windows, files, iframe, assertions, locators, data, or import compatibility.

| Scenario | Recommended steps | Key input |
| --- | --- | --- |
| Login, search, forms | `fill`, `clear`, `press`, `check`, `selectOption` | Values accept `${data.key}`; multi-select uses a JSON array. |
| Slow or asynchronous pages | `waitForVisible`, `waitForHidden`, `waitForURL`, `waitForLoadState` | Wait for an explicit element or URL; use fixed waits only for unobservable short animations. |
| Alert/Confirm/Prompt | `acceptDialog` or `dismissDialog`, then `toHaveDialogMessage` | Locate the button that triggers the dialog in the dialog action itself; the platform registers the listener before clicking. |
| Popup/new tab | `clickAndSwitchPage`, `switchPage`, `closePage` | Do not use a plain click followed by a fixed delay. |
| Upload/download | `setInputFiles`, `clickAndWaitForDownload`, `toHaveDownloadFilename` | Upload uses absolute paths; downloads are saved under run artifacts. |
| iframe | `switchFrame`, in-frame steps, `switchMainFrame` | Use CSS for one frame and an outer-to-inner JSON array for nested frames. |
| Content and state | `toBeVisible`, `toBeEnabled`, `toHaveText`, `toContainText`, `toHaveValue` | Use hard assertions for critical outcomes and soft assertions only for noncritical checks. |
| DOM/accessibility | `toHaveAttribute`, `toHaveClass`, `toHaveCSS`, `toHaveAccessibleName` | Attribute and CSS assertions require both the property name and expected value. |

The importer converts common `goto/click/fill/press/check/selectOption/setInputFiles`, common assertions, `frameLocator/contentFrame`, and Inspector's common `filter({hasText})/first/last/nth` locator chains. Review `filter({has: locator})`, locator variables, custom helpers, Canvas/maps, closed Shadow DOM, and native operating-system windows in the code editor. Full JavaScript is preserved even when one of these special constructs cannot be visualized completely.

### Proxy

Examples:

```text
http://127.0.0.1:7890
socks5://127.0.0.1:1080
```

The upstream proxy sends browser traffic through Charles or a corporate proxy. For Charles, enter `http://127.0.0.1:8888`; bypass values may be `localhost,127.0.0.1,.corp.internal`. The UI does not persist proxy credentials. Do not change the global operating-system proxy for one case.

Remote mappings provide ordered key-value Map Remote rules. For example, source `https://www.coupang.com/`, target `https://qa-coupang.example/`, and Preserve path enabled maps `/np/campaigns/82` to the same path on QA. Native mappings apply during **replay** and require the same protocol. For recording-time mapping, HTTP↔HTTPS, or header/query/body changes, use Charles as the upstream proxy and configure Charles Map Remote/Rewrite. Use Charles DNS Spoofing when only an IP override is needed while retaining the Host header. Use these features only against authorized QA/staging systems.

### Organize plans, suites, cases, and shared flows

Reorder steps with the drag handle, or insert before/after any step with the adjacent controls. Locator strategies include role, label, text, test ID, placeholder, alt text, title, id, name, class, CSS, and XPath. Match operators include equals, contains, not equals, not contains, and regular expression. Prefer test ID, role, and label; keep class and XPath as last resorts.

**Find page element** opens an authorized URL with the current browser, locale, and proxy settings, scans visible interactive elements, and ranks candidates by resilience. Selecting a candidate only updates the form; save and replay to validate it.

**Local AI diagnosis and fix** uses deterministic on-device rules by default. Configure `LOCAL_AI_URL`, `LOCAL_AI_MODEL`, and optional `LOCAL_AI_API_KEY` for an OpenAI-compatible local model. Apply accepts only server-allowlisted structured patches and stores before/after evidence; arbitrary model-generated code is never executed.

- Test assets use a strict single-parent hierarchy: `Test Plan → Test Suite → Test Case`. Creating or editing a Suite requires one Plan; creating or editing a Case requires one Suite. Moving an asset creates a new version and updates its generated file path.
- A Plan is a release or regression target and runs its Suites in order. Each Suite is a separate execution session, and the Plan record groups status, failed steps, screenshots, video, and Trace by Suite.
- A full Suite run launches one Browser, one Browser Context, and one primary Page, then strictly executes Suite Setup → Case 1 (Setup/body/Teardown) → Case 2 → … → Suite Teardown. Case order comes from the selected Suite version's membership order. Cookies, localStorage, and page state remain continuous. Case Teardown is attempted after a failed body, and Suite Teardown is attempted after Setup or Case failure. The whole Suite produces one primary video and one Trace, with per-failure screenshots. A Plan runs complete Suites sequentially in its Suite order; each Suite has an independent browser session, authentication state, video, and Trace. A Plan may own many Suites, while a Suite has exactly one Plan.
- Standalone replay of Suite Setup/Teardown, a Case or case phase, or a shared flow still creates an isolated fresh browser session and its own video. It never inherits cookies or cache from another replay.
- A Case has Case Setup, body steps/assertions, and Case Teardown. Standalone Case replay gets a fresh Browser Context; during a full Suite run it joins that Suite's shared session. Case Teardown still runs after a body failure.
- A shared flow can be global, Suite-owned, or Case-owned. Suite flows are available to that Suite lifecycle and child Cases; Case flows are limited to that Case. Calls pass JSON parameters and select a version policy. Mark payment, card binding, and order submission as destructive so they are never automatically retried.
- Suite Setup, Suite Teardown, and shared-flow editors each provide standalone Record and Replay actions. Closing Inspector imports full JavaScript, generated Python, and editable no-code steps together. If steps already exist, import pauses for overwrite confirmation; Cancel preserves both code and steps.
- A standalone shared-flow recording or replay does not borrow a case proxy. Save its browser, page locale, proxy, and timeouts under **Edit information → Standalone record/replay settings**. When a case or suite calls the flow, the calling case settings apply instead. If `ERR_ABORTED` leaves the browser at `about:blank`, check the network route and the flow proxy first; increasing an element timeout cannot repair a connection that was never established.

Recommended hierarchy: Plan “Payment regression” → Suite “Card payment” → Suite Setup “Log in” → Case Setup “Open product” → body assertions → Case Teardown “Clear cart” → Suite Teardown “Log out”.

## 6. Record a test case

1. Create a test plan.
2. Create a test suite and select that Plan under **Parent test plan**.
3. Create a test case and select that Suite under **Parent test suite**, then set its name, priority, and tags.
4. Configure browser, page locale, start URL, and test data under Suite or Case settings.
5. From Case Setup, case steps, or Case Teardown, click Record current phase and choose Standard recording or Record after manual login. Suite Setup/Teardown and shared-flow recording offer the same two choices.
6. Perform clicks, fills, selections, and keyboard actions in the Playwright browser.
7. Add assertions in Inspector when convenient, or add them after import.
8. Close the **Playwright Inspector** window (the window with recorder tools/code). There is no Save button to press. Do not merely close the recorded Chrome tab because the recorder process may still be waiting.
9. The page waits for the recorder to exit, then automatically saves complete JavaScript, generates Python, and extracts recognized no-code steps.
10. The app opens the Code editor automatically. The script is already on disk; “Save code locally” is for later manual edits.

The normal workflow requires neither manual import nor handwritten code. “Manual import (fallback)” is only for abnormal browser exits, old recordings, or a lost session status.

The selected tab determines the import target when recording a case phase: recording from Case Setup updates only `setupSteps`, recording from case steps updates only `steps`, and recording from Case Teardown updates only `teardownSteps`. If a complete flow was recorded into the main steps, click **Choose steps for Setup/Teardown**, select one or more steps, and move or copy them to the target phase. One confirmation creates only one new version and synchronizes JS/Python.

### Record after manual login

When a case should contain only authenticated business actions, choose **Record after manual login** in the Record dialog. Complete authentication in the recording browser during Stage 1, but keep Inspector open. Return to the platform and click **Login complete, start recording business steps**. The platform snapshots the login-step boundary and counts only later actions as case steps. Close Inspector after the business flow, then choose whether to create the next version. Saving excludes the login prefix and synchronizes only the business steps to no-code, JavaScript, and Python. The raw Inspector file remains under `recordings/` and can contain entered account values, so protect it as sensitive data. If Inspector has not flushed its script yet, wait briefly and retry the boundary button. Closing Inspector before marking the boundary is rejected to prevent login actions from entering the case.

### Record a case in suite context

1. Record or edit Suite Setup so that it completes authentication.
2. Replay that Suite Setup version. A successful run saves `data/auth/suites/<suite-id>/vN/storage-state.json`. Recording Suite Setup and confirming a new version saves state for that new version as well.
3. Open a case in the suite and select Case Setup, case steps, or Case Teardown.
4. Click Record current phase, choose Standard recording, then select Use suite context as the session starting point.
5. Select the containing suite and Stable, Latest, or a specific version. Only versions marked Login state available can start.
6. The platform loads that version's Cookie/localStorage, opens the case start URL, and records only the selected case phase.

If state is missing, the product reports that Suite vN has no saved login state and never silently falls back to a signed-out session. The Compliant recording entry has been removed; use Record after manual login when suite state cannot be prepared. The product does not solve CAPTCHA, spoof fingerprints, or evade site controls.

## 7. Edit steps and locators

Each step contains:

- Type: action or assertion.
- Operation/assertion: for example `click`, `fill`, `press`, or `toBeVisible`.
- Locator strategy: `role`, `label`, `text`, `testId`, `placeholder`, `css`, or `xpath`.
- Locator value: a role, test ID, text, or selector.
- Accessible name: the name used with a role locator.
- Value: input text, key, URL, expectation, or delay in milliseconds.
- Timeout: maximum wait for the step.
- Stability and advanced waits: pre-step readiness, retry backoff, recovery, and idempotency.
- Continue: record a warning and continue after the final failed attempt.

Prefer locators in this order: `testId` → `role + name` → `label` → stable text/attribute → `css` → `xpath`.

## 8. Add assertions, waits, and error handling

### Assertion example

Verify a button is visible:

```text
Type: assertion
Assertion: toBeVisible
Locator strategy: role
Locator value: button
Accessible name: Submit
```

Verify a URL:

```text
Type: assertion
Assertion: toHaveURL
Value: /dashboard$
```

Available assertions include `toBeVisible`, `toBeHidden`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toHaveText`, `toContainText`, `toHaveValue`, `toHaveCount`, `toHaveURL`, and `toHaveTitle`.

### Waits

Prefer condition-based waits:

- `waitForVisible`
- `waitForHidden`
- `waitForURL`
- `waitForLoadState`

Use `waitForTimeout` only when a fixed pause is necessary. Its value is milliseconds, for example `1000`.

### Slow pages and asynchronous APIs

Choose Fast, Standard (recommended), Slow network, or Custom under Configuration and data. Navigation, action, and assertion timeouts are separate so one global value does not control every phase.

Per-step Stability and advanced waits support:

- Wait for an element to appear, disappear, become enabled/editable, or contain text.
- Wait for URL, `DOMContentLoaded`, or `load`.
- Fixed/exponential backoff plus reload/reopen recovery.
- Click and wait for response: register URL/method observation before the click, then validate HTTP status without missing a fast response.

Do not use `networkidle` as a universal readiness signal; modern pages may poll continuously. Wait for a loading indicator, primary content, or a business API instead.

Idempotency is critical. Auto does not repeat clicks or other potentially side-effecting actions. Select Safe only for confirmed repeatable queries/expansions. Mark payment, order creation, deletion, refund, and approval submissions as Never repeat.

### Error handling

- Timeout: adjust navigation, action, or assertion timeouts only for a genuinely slow phase.
- Retry: use one or two backoff retries only for transient timeouts, network failures, and HTTP 5xx. A recovered run remains visibly flaky/recovered.
- Continue: use only for non-critical checks. Do not continue after failed login, payment, or submission steps.

## 9. Replay cases and plans

- Standalone phase, case, and shared-flow replay: select Stable/Latest/a specific version, then choose Replay native code or Replay current steps. A historical version without native replay code clearly falls back to current steps.
- Suite/plan execution: choose per-phase defaults, prefer native replay code, or all current steps. Suite Setup, shared flows, Case Setup/body/Teardown, and Suite Teardown may mix engines while staying in one Browser/Context/Page, one video, and one Trace per Suite.
- Run records: filter by status/scope, open evidence, delete one record, or clear metadata from the Runs page.
- Dashboard: monitor plan count, case count, run count, pass rate, recent runs, and the latest failure.

## 10. Inspect failure evidence

The failure panel first shows the step number, operation, locator, category, likely cause, and suggested fix. Expand raw technical details only when needed, then inspect:

```text
artifacts/<run-id>/failure.png
artifacts/<run-id>/trace.zip
artifacts/<run-id>/*.webm
```

Open a trace:

```bash
npx playwright show-trace artifacts/<run-id>/trace.zip
```

The trace contains steps, page snapshots, network activity, and console evidence.

## 11. Troubleshooting

### Element not found

Check:

1. The locator strategy is correct; do not convert `role=combobox` into `label=combobox`.
2. Recording and replay use the same page locale.
3. The action did not move into an iframe, popup, or new tab.
4. The page finished loading.

### Incomplete import

Select the newest relevant recording. The importer supports common Playwright codegen statements. Complex locator chains, frame locators, and custom JavaScript may require manual steps.

### `ERR_NETWORK_CHANGED`

Check VPN, proxy, Wi-Fi changes, and the operating-system network. Replay after the connection is stable.

### `Access Denied` or CAPTCHA

Replay reports Access Denied, CAPTCHA, and unusual-traffic pages as “Target site rejected automation” instead of a generic locator timeout and stops pointless retries. Do not bypass controls; use an authorized environment, request IP/test-account allowlisting, or use Record after manual login for permitted human verification.

### Port already in use

Use another port:

```bash
PORT=4174 npm start
```

## 12. Asset versions, Stable, and replay selection

Cases, suites, and public flows keep multiple immutable versions. Completing a recording, saving no-code steps or source, or applying an AI fix creates a new version instead of overwriting history. The detail header shows Latest and Stable; open Version history to inspect, replay, compare, edit the version description, or mark a version Stable. Versions no longer have extra tags: Stable is the single stability marker. Case-level business tags remain available for asset search and filtering.

When replaying a case, suite, or public flow, choose Stable for regression, Latest for active debugging, or a specific version to reproduce an old result. A suite version includes Setup, Teardown, configuration, data, and child-case version policies. Run records preserve the versions that were actually resolved.

After version selection, choose the execution source: **Replay native code** runs that version's editable Playwright native replay source, while **Replay current steps** runs its structured steps. Suite/Plan runs can use phase defaults, prefer native replay code, or force current steps; history freezes the source actually used by every phase.

A linked selector on **Test execution** displays `Test Plan → Test Suite → Test Case`. Focusing a plan shows only that plan's suites; focusing a suite shows only that suite's cases. Checking a Plan selects every child Suite and Case by default, and checking a Suite selects every child Case. Clearing a child makes its parent indeterminate. Case-only execution still runs the owning Suite Setup and Teardown in the same browser session, so authentication is preserved.

Use **Versions for this run** below the hierarchy. Choose Stable, Latest, or a specific suite version; the selected atomic suite version supplies both Suite Setup and Suite Teardown plus settings and membership. For a case subset, override each case with Stable, Latest, or a specific version. If the requested Stable/Latest Suite snapshot predates a selected Case, the confirmation dialog visibly switches Setup/Teardown to the newest Suite version containing every selected Case while each Case still follows the requested Stable/Latest policy. Execution is blocked if no compatible Suite version exists. Historical stores gain a new membership-repair version without rewriting old snapshots or changing Stable. The preview shows the exact version chain. Run details show the resolved Suite, Setup, Case, and Teardown versions and pass/fail/skip state, with per-step failure reasons and screenshots plus the shared video and Trace. These values are stored permanently.

**Record after manual login** captures both the login-step snapshot and step count when **Login complete, start recording business steps** is clicked. The importer removes an exact login prefix first. If Inspector rewrites that prefix, it uses the captured count and asks the user to verify the first business step. If the final script cannot safely apply either boundary, it imports the complete recording instead of failing and prominently asks the user to remove login actions manually. This applies consistently to Suite Setup/Teardown, all Case phases, and shared flows.

Convenience source files remain at their original locations, while immutable sources are also saved under `test-suites/.../versions/vN/`. Do not manually overwrite historical version folders.

Historical versions are never edited in place. Choose **Edit from this version** to load its Suite Setup/Teardown, Case Setup/steps/Teardown, or shared-flow steps as a working copy. Saving creates the next never-before-used version number and synchronizes structured steps, JavaScript, and Python. Deleted numbers are not reused.

Cleanup has two levels. **Archive** hides a version from default lists and replay selectors while retaining its files and allowing restoration. **Delete permanently** requires the version to be archived first and requires typing `vN`; it then removes the structured snapshot, JS/Python files, and any suite-version login state. Latest, Stable, the only remaining version, an active recording base, or a version pinned by a suite/shared flow cannot be archived or deleted. Versions referenced by run history can be archived but not permanently deleted. Change Stable/Latest or pinned references before retrying cleanup. Version numbers are never renumbered.

A suite version is an atomic snapshot of Setup, Teardown, configuration, data, and case bindings. A case version atomically includes Setup, main steps, Teardown, configuration, and both source languages. The UI reports changed scopes but does not mix unrelated lifecycle-phase versions, keeping replay deterministic.

## 13. Security and limitations

- Never store production passwords, tokens, card data, or one-time codes.
- Do not connect automation to the normal Chrome profile; use an isolated test profile.
- Playwright WebKit is not real Safari.
- CAPTCHA, DRM, browser chrome, native file dialogs, cross-origin restrictions, and Canvas/WebGL may not record reliably.
- Automate only systems you own or are explicitly authorized to test.

## Self-test

After code changes, run:

```bash
npm run test:e2e
```

The suite covers plan folders, JS/Python, codegen import, exact locators, visual/code replay, plan execution, friendly diagnostics, screenshot/video/trace artifacts, dashboard, and run-record CRUD.
