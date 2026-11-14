import json

from code_graph import queries, scan as cg
from code_graph.backends import graphify_backend, static_backend
from harness.kb import KnowledgeBase
from workflows.common import ROOT

GRAPH = json.loads((ROOT / "fixtures" / "code_graph" / "sample-checkout.json").read_text())


def test_affected_files_follow_reverse_dependencies():
    hit = queries.affected_files(GRAPH, ["shared/money.ts"])
    assert hit == {"shared/money.ts": 0, "checkout/payment/submit.ts": 1, "checkout/cart.ts": 1}


def test_static_backend_scans_this_project(tmp_path):
    graph = cg.scan(ROOT, backend="static")
    deps = queries.file_dependents(graph)
    assert "device_farm/pipeline.py" in deps["device_farm/monitor.py"]
    assert "workflows/release_guard.py" in deps["code_graph/queries.py"]
    kb = KnowledgeBase(tmp_path)
    summary = cg.to_knowledge_base(graph, "self", kb, "var/code-graph/self.json")
    assert kb.load("self", "operational")["code_graph"]["files"] == summary["files"] > 20


def test_js_relative_imports_resolve(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.ts").write_text("import { b } from './b';\nexport function a() {}\n")
    (tmp_path / "src" / "b.ts").write_text("export class B {}\n")
    graph = static_backend.scan(tmp_path)
    assert {"source": "file:src/a.ts", "target": "file:src/b.ts", "relation": "imports"} in graph["edges"]


def test_graphify_output_is_normalized():
    raw = {"nodes": [
        {"id": "a", "label": "a.py", "file_type": "code", "source_file": "pkg/a.py"},
        {"id": "a_f", "label": "f()", "file_type": "code", "source_file": "pkg/a.py"},
        {"id": "b", "label": "b.sh", "file_type": "code", "source_file": "b.sh", "metadata": {"kind": "file", "language": "bash"}},
        {"id": "c", "label": "idea", "file_type": "concept", "source_file": "pkg/a.py"}],
        "links": [{"source": "a", "target": "a_f", "relation": "contains"},
                  {"source": "a_f", "target": "b", "relation": "calls"},
                  {"source": "a", "target": "json", "relation": "imports"},          # external: dropped
                  {"source": "c", "target": "a", "relation": "rationale_for"}]}       # not a code relation: dropped
    g = graphify_backend.normalize(raw)
    assert [(n["kind"], n["language"]) for n in g["nodes"]] == [("file", "python"), ("symbol", "python"), ("file", "bash"), ("concept", "python")]
    assert [e["relation"] for e in g["edges"]] == ["contains", "calls"]
