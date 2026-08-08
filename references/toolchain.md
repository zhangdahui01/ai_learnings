# Multi-language code-graph toolchain

## Baseline without installation

Use `scripts/static_index.py` first. It is intentionally shallow: files, declarations, imports, route literals, test declarations, and UI-source risk patterns. Its DOT/JSON output enables a local code knowledge base even when a repository cannot build. Label its results `static-candidate` or `inferred`, never runtime-proven.

## Semantic graph engines

Use **jQAssistant + Neo4j** as the durable architecture graph for Java/JVM systems with Maven/Gradle metadata and configuration. It is the preferred Java multi-repository system of record.

Use **Joern** for Code Property Graph deep dives where statement-level AST, CFG, or PDG/data-flow matters. Its documented frontends include Java, JavaScript, Python, PHP, C/C++, C#, Go, Kotlin, Ruby, and Swift; confirm the installed version before selecting it. Keep CPG output bounded: an entry point, a depth limit, and explicit external boundaries.

Use **CodeQL** for build-aware semantic/call/data-flow queries. It currently supports C/C++, C#, Go, Java, Kotlin, JavaScript/TypeScript, Python, Ruby, Rust, and Swift. Use it to validate selected facts rather than blocking the zero-install baseline; compiled-language extraction may need the normal build.

Use **Tree-sitter** for syntax-tree inventory when a semantic tool does not support the language. It parses code syntax, but cannot by itself prove call/data-flow relationships.

## Rendering and storage

Use Graphviz to render DOT into SVG/PNG. Store graph JSON plus source references locally in `knowledge-base.json`; this is the retrieval layer for future Codex analysis. Add Neo4j only when graph queries, cross-run persistence, or large-scale exploration justify its operational cost. Never upload proprietary source into a third-party graph/RAG service without explicit approval.

## Evidence levels

- `proven-runtime`: supplied test/coverage/trace artifact proves execution.
- `static-candidate`: direct source syntax or extractor result.
- `inferred`: AI/domain-name/semantic similarity; requires human confirmation.
