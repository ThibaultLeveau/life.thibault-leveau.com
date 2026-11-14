"""Explicit contract implemented by every application's manifest."""

from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True)
class ApplicationDefinition:
    id: str
    name: str
    description: str
    path: str
    icon: str
    router: APIRouter
    default_enabled: bool = False
