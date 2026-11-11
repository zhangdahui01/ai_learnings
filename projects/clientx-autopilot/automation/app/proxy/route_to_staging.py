"""mitmproxy addon: route app traffic to the staging environment and mark it as test traffic.

    mitmdump -s proxy/route_to_staging.py --set clientx_routes=proxy/routes.json

routes.json maps a production host to its staging host. Copy routes.example.json to routes.json
(git-ignored) and fill in the real hosts on the Mac. Hosts that are not listed pass through untouched.
"""
import json
from pathlib import Path


def rewrite(host: str, routes: dict) -> str | None:
    """Exact host first, then the longest matching '*.suffix' rule."""
    if host in routes:
        return routes[host]
    best = max((k for k in routes if k.startswith("*.") and host.endswith(k[1:])), key=len, default=None)
    return routes[best] if best else None


class RouteToStaging:
    def __init__(self) -> None:
        self.routes: dict = {}
        self.flag_header = "x-test-traffic"

    def load(self, loader) -> None:
        loader.add_option("clientx_routes", str, "proxy/routes.json", "JSON file: production host -> staging host")
        loader.add_option("clientx_flag_header", str, "x-test-traffic", "header that marks test traffic")

    def configure(self, updates) -> None:
        from mitmproxy import ctx
        path = Path(ctx.options.clientx_routes)
        self.routes = json.loads(path.read_text()) if path.exists() else {}
        self.flag_header = ctx.options.clientx_flag_header

    def request(self, flow) -> None:
        target = rewrite(flow.request.pretty_host, self.routes)
        if target:
            flow.request.host = target
            flow.request.headers["Host"] = target
            flow.request.headers[self.flag_header] = "1"


addons = [RouteToStaging()]
