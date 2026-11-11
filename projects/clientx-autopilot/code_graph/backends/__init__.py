from . import graphify_backend, static_backend

BACKENDS = {"graphify": graphify_backend, "static": static_backend}


def pick(name: str = "auto"):
    """auto = Graphify when it is installed, otherwise the zero-install static scanner."""
    if name == "auto":
        return graphify_backend if graphify_backend.available() else static_backend
    return BACKENDS[name]
