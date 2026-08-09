# AI Learnings Hub

一个用于沉淀 AI 学习、工具、实验和可复用 Agent Skill 的个人仓库。每个能力是独立模块；根目录只负责导航、约定与 GitHub Pages，不承担具体 Skill 的执行说明。

## Structure

```text
ai_learnings/
├── skills/                         # Reusable agent skills
│   └── regression-gap-analyzer/    # Code graph and regression-gap analysis
├── experiments/                    # Future prototypes and notebooks
├── notes/                          # Future learning notes and decision records
├── templates/                      # Future reusable prompts/templates
├── docs/                           # GitHub Pages site and published reports
└── .github/workflows/              # Pages deployment
```

## Current module

`skills/regression-gap-analyzer` analyzes local source and UI-automation repositories, producing code graphs, a knowledge base, CSV backlog, and an accessible HTML report. Read that module's `GUIDELINE.zh-CN.md` or `GUIDELINE.en.md` for installation and use.

## Add a new AI module

Create a focused directory under `skills/`, `experiments/`, `notes/`, or `templates/`. Keep module-specific agent instructions, dependencies, and guides inside that module; update this README and `docs/index.html` with a short link.

## GitHub Pages

The `docs/` directory is a static site. The included workflow deploys it after Pages is enabled in repository **Settings → Pages → Source → GitHub Actions**. Published reports live under `docs/reports/<report-name>/`.
