# Execution contract

## Case JSON shape

```json
{
  "schemaVersion": 1,
  "id": "case-login-valid",
  "name": "Valid user signs in",
  "version": 3,
  "accountRef": "accounts.standard-user",
  "tags": ["smoke", "login"],
  "defaults": {
    "browser": "chromium",
    "baseUrl": "https://example.test",
    "proxy": {
      "mode": "direct",
      "server": "",
      "bypass": "localhost,127.0.0.1",
      "mappings": [
        {
          "enabled": true,
          "from": "https://www.coupang.com/",
          "to": "https://qa-coupang.example/",
          "preservePath": true
        }
      ]
    },
    "stability": {
      "preset": "standard",
      "navigationTimeoutMs": 30000,
      "actionTimeoutMs": 10000,
      "assertionTimeoutMs": 10000
    },
    "timeoutMs": 10000
  },
  "dataSetRefs": ["data.login-valid"],
  "steps": [
    {
      "id": "step-1",
      "kind": "action",
      "action": "fill",
      "locator": {"primary": {"strategy": "label", "value": "Email"}, "fallbacks": []},
      "value": "${data.email}",
      "sensitive": false,
      "timeoutMs": 10000,
      "readiness": {
        "type": "elementHidden",
        "locator": {"primary": {"strategy": "testId", "value": "loading"}},
        "timeoutMs": 15000
      },
      "retryPolicy": {
        "maxAttempts": 2,
        "baseDelayMs": 1000,
        "backoff": "exponential",
        "recovery": "reload",
        "idempotency": "auto"
      }
    },
    {
      "id": "step-2",
      "kind": "assertion",
      "assertion": "toHaveURL",
      "expected": "/dashboard$",
      "timeoutMs": 10000
    }
  ]
}
```

Reject unknown `action` and `assertion` values. Encrypt secret values at rest and store only `${secret.name}` references in this format.

`readiness.type` supports `none`, `elementVisible`, `elementHidden`, `elementEnabled`, `elementEditable`, `elementText`, `url`, and `loadState`. Prefer an element or business-state signal over `networkidle`. `retryPolicy.idempotency=auto` must not repeat clicks or other potentially side-effecting actions; use `safe` only after the user explicitly confirms idempotency, and `never` for payment, order, deletion, or approval submissions.

For an atomic action/network wait use `action: clickAndWaitForResponse` plus `response: {urlPattern, method, status, timeoutMs}`. Register the response wait before clicking so a fast response cannot be missed.

## Actions

| Group | Actions |
|---|---|
| Navigation/window | `goto`, `back`, `forward`, `reload`, `newPage`, `switchPage`, `closePage` |
| Pointer/keyboard | `click`, `rightClick`, `dblclick`, `tap`, `hover`, `focus`, `press`, `keyDown`, `keyUp`, `scrollDown`, `scrollUp`, `scrollLeft`, `scrollRight`, `scrollToElement`, `scrollToTop`, `scrollToBottom`, `swipeLeft`, `swipeRight`, `swipeUp`, `swipeDown`, `dragTo`, `mouseMove` |
| Text/editable | `fill`, `clear`, `type`, `selectText`, `setInputFiles` |
| Choice controls | `check`, `uncheck`, `selectOption`, `chooseRadio`, `setSliderValue` |
| Rich widgets | `selectAutocompleteOption`, `expandTreeNode`, `collapseTreeNode`, `selectGridRow`, `dismissDialog`, `acceptDialog` |
| Wait/data | `waitForVisible`, `waitForHidden`, `waitForURL`, `waitForLoadState`, `clickAndWaitForResponse`, `waitForDownload`, `extractText` |
| Frames/shadow | `switchFrame`, `switchMainFrame`, `pierceShadow` |

The no-code editor groups these operations by product priority: P0 common Web actions; P1 dialogs/windows/files; P1 frames and complex widgets; and P2 low-level keyboard/mouse/events. Event-coupled actions must be atomic: register the dialog, popup, response, or download wait before triggering the click. `switchFrame` sets the active locator scope until `switchMainFrame`; `clickAndSwitchPage` changes the active page until `closePage` or `switchPage`.

Use `fill` for text/password/textarea/contenteditable when supported; detect password fields and always set `sensitive: true`. Treat file chooser and native dialogs as browser-adapter-dependent.

## Assertions

Support at least:

`toBeVisible`, `toBeHidden`, `toBeAttached`, `toBeEnabled`, `toBeDisabled`, `toBeEditable`, `toBeEmpty`, `toBeFocused`, `toBeInViewport`, `toBeChecked`, `toHaveText`, `toContainText`, `toHaveValue`, `toHaveValues`, `toHaveAttribute`, `toHaveClass`, `toContainClass`, `toHaveCSS`, `toHaveId`, `toHaveAccessibleName`, `toHaveAccessibleDescription`, `toHaveRole`, `toHaveCount`, `toHaveURL`, `toHaveTitle`, `toMatchScreenshot`, `toHaveDownload`, `toHaveResponseStatus`.

Also support `toHaveJSProperty`, `toHaveAccessibleErrorMessage`, inline `toMatchAriaSnapshot`, `toHavePageCount`, `toHaveDownloadFilename`, `toHaveDialogMessage`, and `toHaveStoredValue`. `negated: true` applies the inverse matcher. `soft: true` records a warning and continues without hiding the failure from the step report. Screenshot actions save evidence immediately; visual screenshot comparison remains a separate baseline-review workflow and must never silently create or overwrite a baseline.

## Public-flow version policy

A `flowCall` uses `versionPolicy: "pinned" | "latest"`. `pinned` stores `flowVersion` and keeps regression behavior stable until the user explicitly clicks upgrade. `latest` resolves the flow's current version at execution time and leaves `flowVersion` empty. Existing calls without `versionPolicy` are treated as pinned for backward compatibility. The editor must show the resolved version and must not ask users to type a version number.

Each assertion takes `expected` where applicable, `negated`, `timeoutMs`, and optional `soft`. Screenshot baselines need an explicit review/approval workflow; never overwrite them after a failure.

## Asset version policy

Cases, suites, and public flows share one immutable execution-version model. Keep `currentVersion`, `stableVersion`, `editRevision`, and a `versions` array on each asset. `editRevision` is only an optimistic-concurrency token; never use it as an executable version. A version entry stores status (`draft`, `candidate`, `stable`, or `deprecated`), tags, description, source, creation time, base version, and a complete executable snapshot.

- Recording, visual-step saves, JavaScript/Python saves, membership changes, and applied AI fixes create a new version. Never mutate an existing stable snapshot.
- A replay request uses `versionSelector.policy: stable | latest | specific`; `specific` also carries `version`.
- A suite version snapshots Setup, Teardown, configuration, data, account, ordered case membership, and each case binding policy. Case bindings support `pinned`, `stable`, and `latest`.
- A public-flow call supports `pinned`, `stable`, and `latest`. The UI resolves versions from a list; users never type raw version numbers.
- Every run record stores the resolved asset version and resolved dependency versions. Historical records must not be re-resolved after Stable or Latest changes.
- Existing flat files remain as convenience launchers, while immutable sources are also written under `versions/vN/` folders.

## Locator bundle

```json
{
  "primary": {"strategy": "role", "value": "button", "name": "Continue", "confidence": 0.97},
  "fallbacks": [
    {"strategy": "testId", "value": "continue-button", "confidence": 0.96},
    {"strategy": "css", "value": "button[type=submit]", "confidence": 0.60}
  ]
}
```

Allowed strategies: `testId`, `role`, `label`, `placeholder`, `text`, `altText`, `title`, `id`, `name`, `class`, `css`, `xpath`. `operator` supports `equals`, `contains`, `notEquals`, `notContains`, and `regex`. Prefer exactly one semantic primary locator. Treat `id`, `name`, and `class` as CSS/attribute implementations whose stability must be reviewed; XPath is last-resort and needs a recorder warning. Locator discovery may inspect an authorized target page and rank test ID, role, label, stable attributes, CSS, and XPath candidates, but the user must replay to validate the chosen locator.

## Browser adapters

| Target | Adapter | Requirement |
|---|---|---|
| Chrome/Chromium | Playwright Chromium; optionally Chrome channel | Full core support |
| Firefox | Playwright Firefox | Full core support except platform-specific deviations |
| WebKit | Playwright WebKit | Label as WebKit, never Safari |
| Safari | Selenium WebDriver + SafariDriver on macOS | Capability-limited adapter; document unsupported traces, downloads, and interactions |

Apply upstream proxy before creating the browser/context. Support `{mode, server, bypass}` and `direct`; do not mutate global OS proxy settings or persist credentials. `mappings` is an ordered list of URL-prefix rules and the first enabled match wins. Native mappings apply to replay and must keep the protocol unchanged; recording-time or cross-protocol mapping belongs in an authorized external proxy such as Charles Map Remote.
