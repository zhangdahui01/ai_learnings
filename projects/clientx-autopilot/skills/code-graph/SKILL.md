---
name: code-graph
description: Scan a service repository into a code knowledge graph (Graphify, with a zero-install fallback) and write its summary into the service knowledge base. Use to baseline a service, to find which journeys and cases a PR reaches, or when asked to build a code knowledge graph.
---
# Code graph

```bash
pip install graphifyy          # optional; without it the static fallback is used
python -m code_graph.scan --repo /path/to/service-repo --service <service> --kb knowledge-base
```

- Backend `graphify` runs code-only: tree-sitter on the local machine, no LLM, nothing leaves it. `--backend static` needs nothing installed and is shallower.
- The full graph is written to `var/code-graph/<service>.json` (git-ignored); only the summary goes to `knowledge-base/<service>/operational.json`.
- Consumers: CI gate case selection and Release Guard hop 7 (`code_graph.queries.journeys_touched`), Coverage Intelligence ("changed code, no case ran").
- Never commit a scanned repository or its full graph. Graphify leaves `graphify-out/` inside the scanned repo; keep it out of that repo's commits.
