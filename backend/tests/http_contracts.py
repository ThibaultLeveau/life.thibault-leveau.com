"""Inspect effective HTTP operations, including nested routers and their prefixes."""

from fastapi import FastAPI


def application_operations(definition):
    app = FastAPI()
    app.include_router(definition.router)
    return {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method in {"get", "post", "put", "patch", "delete", "head", "options"}
    }
