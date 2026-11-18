"""Shared configuration and stable argument fingerprints."""

import hashlib
import json

from life_app.platform.assistant import credentials
from life_app.platform.assistant import models as m
from life_app.platform.assistant import schemas as s


def fingerprint(value) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def settings(db, user):
    row = db.get(m.AssistantSettings, user.id)
    if row is None:
        row = m.AssistantSettings(user_id=user.id)
        db.add(row)
        db.flush()
    return row


def settings_output(row):
    return s.SettingsOutput(
        provider=row.provider,
        model=row.model,
        configured=bool(row.ciphertext),
        token_hint=row.token_hint,
    )


def update_settings(db, user, runtime_settings, payload):
    row = settings(db, user)
    if payload.provider is not None and payload.provider != row.provider:
        row.provider = payload.provider
        row.ciphertext = None
        row.token_hint = None
        row.model = ""
    if payload.model is not None:
        row.model = payload.model
    if "api_token" in payload.model_fields_set:
        if payload.api_token is None:
            row.ciphertext = None
            row.token_hint = None
        else:
            token = payload.api_token.get_secret_value()
            row.ciphertext = credentials.encrypt(runtime_settings, user.id, row.provider, token)
            row.token_hint = "••••" + token[-4:]
    db.flush()
    return settings_output(row)
