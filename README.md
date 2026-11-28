# AI Learnings Hub

一个用于沉淀 AI 学习、工具、实验和可复用 Agent Skill 的个人仓库。每个能力是独立模块；根目录只负责导航、约定与 GitHub Pages，不承担具体 Skill 的执行说明。

## Structure

```text
ai_learnings/
├── skills/                         # Reusable agent skills
│   ├── regression-gap-analyzer/    # Code graph and regression-gap analysis
│   └── local-web-test-recorder/    # Local browser test recording and replay
├── projects/                       # Multi-module systems
│   ├── clientx-autopilot/          # AI-driven UI automation and Device Farm harness
│   ├── quiet-hall/                 # 静堂: shared meditation hall app (Expo + Node), sample app under test
│   ├── yundeng-island/             # 云灯岛: 3D browser game with accounts and cloud saves, sample app under test
│   └── seoul-life-app/             # 首尔生活助手: photo-to-translation phone web app (Next.js + Supabase + Claude)
├── experiments/                    # Future prototypes and notebooks
├── notes/                          # Learning notes and decision records
├── templates/                      # Future reusable prompts/templates
├── docs/                           # GitHub Pages site and published reports
└── .github/workflows/              # Pages deployment
```

## Current modules

- [`projects/clientx-autopilot`](projects/clientx-autopilot/README.md) is an agent harness for UI automation and Device Farm operations: six workflows (case factory, case care, release guard for CI and CD gates, farm autopilot, coverage intelligence, service onboarding), agents and skills, a per-service knowledge base, a code knowledge graph (Graphify), BDD web automation on Playwright, app automation on Appium for Android emulators, iOS Simulators and real iPhones, and a Device Farm monitor dashboard generator.
- [`skills/QA/mobile-web-device-farm`](skills/QA/mobile-web-device-farm/SKILL.md) turns a Mac into a mobile device farm in one command (Homebrew, Appium + UiAutomator2/XCUITest, Android SDK, mitmproxy, `~/.zshrc` environment), boots Android emulators and an iOS simulator with one mitmproxy and one Appium server per device, runs an Appium mobile-web test (m.coupang.com by default) on every device and writes an HTML/Markdown report.
- [`skills/QA/domain-automation-handbook`](skills/QA/domain-automation-handbook/SKILL.md) converts automation pilot designs into operational domain handbooks with onboarding, BDD generation, maintenance, and CI/CD gate guidance.
- [`projects/quiet-hall`](projects/quiet-hall/README.md) is a shared meditation hall app for Android, iOS and the web (Expo) with a dependency-free Node server; it is the sample app the ClientX Autopilot web and Appium cases run against.
- [`projects/yundeng-island`](projects/yundeng-island/README.md) is a 3D browser game (three.js) with accounts and cloud saves on Supabase; it is the second sample app, covered by the `island-*` BDD cases in ClientX Autopilot.
- [`projects/seoul-life-app`](projects/seoul-life-app/README.md) is a phone web app for living in Seoul without Korean: photograph a shelf, menu, cosmetics label or subway sign and get Chinese and English explanations, a recommendation, unit prices and a saved word list (Next.js on Vercel, Supabase, Claude Haiku); covered by the `seoul-*` BDD cases in ClientX Autopilot.
- `skills/regression-gap-analyzer` analyzes local source and UI-automation repositories, producing code graphs, a knowledge base, CSV backlog, and an accessible HTML report. Read that module's `GUIDELINE.zh-CN.md` or `GUIDELINE.en.md` for installation and use.
- `skills/local-web-test-recorder` provides a Codex, Claude Code, and Devin-compatible Agent Skill plus a self-hosted Playwright recorder and replay application with test-plan management, assertions, waits, retries, proxy/browser configuration, artifacts, and bilingual beginner documentation. Start with its `SKILL.md`, `guideline.zh-CN.md`, or `guideline.en.md`.
- [`skills/stock-daily-report`](skills/stock-daily-report/SKILL.md) produces the daily stock report (prices, charts, sourced news, analysis and scenario outlook) for a watchlist: the agent writes one JSON data file per day and `build.py` renders the page and archive under `docs/reports/stock-daily/`.

- [`notes/ivf-research`](notes/ivf-research/README.md) is a Chinese research note on IVF and surrogacy for single women around 40: illustrated principles and process, country-by-country rules and costs, and a US route plan. Published at `docs/reports/ivf-research/`.

- [`notes/french-soft-styling`](notes/french-soft-styling/README.md) is a Chinese soft-furnishing plan for a French-style apartment: diagnosis, palette, lighting and styling rules with sources, a phased shopping list, a palette board, and three annotated photos. Published at `docs/reports/french-soft-styling/`.

- [`notes/seoul-medical-aesthetics`](notes/seoul-medical-aesthetics/README.md) is a Chinese beginner's research report on medical aesthetics in Seoul: treatment categories with pros and cons, which to prioritise or avoid, clinic districts and clinic types, 2026 price ranges with sources, and a checklist for choosing a clinic. Published at `docs/reports/seoul-medical-aesthetics/`.

## Add a new AI module

Create a focused directory under `skills/`, `projects/`, `experiments/`, `notes/`, or `templates/`. Keep module-specific agent instructions, dependencies, and guides inside that module; update this README and `docs/index.html` with a short link.

## GitHub Pages

The `docs/` directory is a static site. The included workflow deploys it after Pages is enabled in repository **Settings → Pages → Source → GitHub Actions**. Published reports live under `docs/reports/<report-name>/`.
