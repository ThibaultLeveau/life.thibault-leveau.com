"""Localize Pydantic's public validation details without returning submitted values."""

from pydantic import BaseModel

from life_app.core.messages import tr


class HTTPErrorOutput(BaseModel):
    detail: str
    code: str


class ValidationItem(BaseModel):
    loc: list[str | int]
    type: str
    code: str
    msg: str


class ValidationErrorOutput(BaseModel):
    detail: list[ValidationItem]


MESSAGES = {
    "missing": "missing",
    "extra_forbidden": "extra",
    "literal_error": "literal",
    "string_too_short": "short",
    "string_too_long": "long",
    "greater_than_equal": "ge",
    "greater_than": "gt",
    "less_than_equal": "le",
    "less_than": "lt",
    "int_type": "integer",
    "int_parsing": "integer",
    "int_from_float": "integer",
    "float_type": "number",
    "float_parsing": "number",
    "finite_number": "number",
    "bool_type": "boolean",
    "bool_parsing": "boolean",
    "uuid_parsing": "uuid",
    "uuid_type": "uuid",
    "string_pattern_mismatch": "pattern",
}


def validation_detail(item: dict) -> dict:
    kind = item["type"]
    context = item.get("ctx", {})
    custom = context.get("error")
    if kind == "value_error" and isinstance(custom, ValueError):
        message = str(custom)
        code = getattr(custom.args[0], "code", kind) if custom.args else kind
    else:
        key = "date" if kind.startswith(("date_", "datetime_")) else MESSAGES.get(kind, "invalid")
        message = tr(f"validation_{key}", **context)
        code = kind
    return {"loc": item["loc"], "type": kind, "code": code, "msg": message}
