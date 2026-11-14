---
name: ci-gate
description: Run and wire the two quality gates - the pre-merge Quality Gate (CI, selected cases, blocks the merge) and the post-merge Release Gate (CD, regression on staging, blocks the release) - and register or promote cases into them. Use when adding a case to CI/CD, running a gate locally, or setting up the pipeline.
---
# CI/CD gates

```bash
python -m ci.gate plan     --gate ci --service <service> --changed <files...>   # which cases and why
python -m ci.gate run      --gate ci --service <service> --pr <id> --diff-base origin/main --repo <repo>
python -m ci.gate run      --gate cd --service <service> [--device-profile android-emulator|ios-simulator|ios-real]
python -m ci.gate register --service <service> --case <id> --journey <journey> --stack web --spec <spec id>
python -m ci.gate register --service <service> --case <id> --journey <journey> --stack app --test <pytest test name>
python -m ci.gate promote  --service <service> --case <id> --passes 7 --pass-rate 0.99 [--signed-off-by <name>]
python -m ci.gate status   --service <service>
```

- **Joining the gates:** `register` adds the case as `incubating` (daily run only). `promote` moves it `incubating → warn` after 7 daily passes in a row at 98%, and `warn → gated` only with a person's sign-off. `warn` cases run in the gates but do not block.
- **CI selection:** the smoke set plus gated cases of every journey the PR reaches through the code graph (`policies/gates.json`).
- **Red means red:** a failed, skipped or missing blocking case, or zero selected cases. Exit code 1. Nothing is retried or repaired in a gate; Release Guard triages and a person decides (`python -m harness decide gate:<id> ...`).
- **Pipeline templates:** `ci/templates/github-actions.yml`, `ci/templates/circleci.yml`.
