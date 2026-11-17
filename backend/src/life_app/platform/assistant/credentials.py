"""Authenticated credential encryption with a separately backed-up rotation keyring."""

import json

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from life_app.platform.assistant.messages import failure


def keyring(settings) -> MultiFernet:
    try:
        keys = settings.assistant_encryption_keys
        if not keys:
            raise ValueError
        return MultiFernet([Fernet(key.strip()) for key in keys.get_secret_value().split(",")])
    except (ValueError, TypeError):
        raise failure(503, "assistant.encryption_unavailable") from None


def encrypt(settings, user_id, provider, token: str) -> str:
    envelope = json.dumps({"user": str(user_id), "provider": provider, "token": token})
    return keyring(settings).encrypt(envelope.encode()).decode()


def decrypt(settings, row) -> str:
    if not row or not row.ciphertext:
        raise failure(409, "assistant.provider_not_configured")
    try:
        envelope = json.loads(keyring(settings).decrypt(row.ciphertext.encode()))
        if envelope["user"] != str(row.user_id) or envelope["provider"] != row.provider:
            raise ValueError
        return envelope["token"]
    except (InvalidToken, ValueError, KeyError):
        raise failure(409, "assistant.credential_unreadable") from None
