import hashlib
import secrets
from datetime import timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, Header, HTTPException, Request, Security
from fastapi.security import APIKeyCookie
from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert

from life_app.core.database import Database, utcnow
from life_app.platform.auth.models import LoginLimit, LoginSession, User

COOKIE = "life_session"
hasher = PasswordHasher()
dummy_hash = hasher.hash(secrets.token_urlsafe(32))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    allowed = {str(request.app.state.settings.public_base_url).rstrip("/")}
    if request.app.state.settings.environment != "production":
        allowed.add(str(request.base_url).rstrip("/"))
    if origin is not None and origin not in allowed:
        raise HTTPException(403, "Origine de requête refusée.")


def current_user(
    request: Request,
    db: Database,
    token: Annotated[str | None, Security(APIKeyCookie(name=COOKIE, auto_error=False))],
    csrf: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> User:
    if not token or len(token) > 200:
        raise HTTPException(401, "Connexion requise.")
    session = db.get(LoginSession, digest(token))
    if session is None or session.expires_at <= utcnow():
        raise HTTPException(401, "Session expirée ou invalide.")
    mutation = request.method not in {"GET", "HEAD", "OPTIONS"}
    if mutation:
        check_origin(request)
        if not secrets.compare_digest(digest(csrf or ""), session.csrf_hash):
            raise HTTPException(403, "Jeton CSRF absent ou invalide.")
    query = select(User).where(User.id == session.user_id)
    if mutation:
        # One owner's writes are serialized, including cross-workspace moves and ordering.
        query = query.with_for_update().execution_options(populate_existing=True)
    user = db.scalar(query)
    if user is None:
        raise HTTPException(401, "Session invalide.")
    if mutation:
        session = db.scalar(
            select(LoginSession)
            .where(LoginSession.token_hash == digest(token))
            .execution_options(populate_existing=True)
        )
        if session is None or session.expires_at <= utcnow():
            raise HTTPException(401, "Session révoquée ou expirée.")
    request.state.login_session = session
    request.state.csrf_token = digest(token + ":csrf")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def check_login_limit(db, request: Request, username: str) -> None:
    now = utcnow()
    # Keys are hashed and expire; never retain raw IPs or attempted login names.
    client = request.client.host if request.client else "unknown"
    buckets = [(digest("account:" + username), 5), (digest("ip:" + client), 30)]
    limited = False
    for key, maximum in sorted(buckets):
        expired = LoginLimit.expires_at <= now
        statement = insert(LoginLimit).values(
            key=key, attempts=1, expires_at=now + timedelta(minutes=15)
        )
        count = db.scalar(
            statement.on_conflict_do_update(
                index_elements=[LoginLimit.key],
                set_={
                    "attempts": case((expired, 1), else_=LoginLimit.attempts + 1),
                    "expires_at": case(
                        (expired, now + timedelta(minutes=15)), else_=LoginLimit.expires_at
                    ),
                },
            ).returning(LoginLimit.attempts)
        )
        limited = limited or count > maximum
    db.commit()  # Failed requests must still consume attempts.
    if limited:
        raise HTTPException(
            429, "Trop de tentatives. Réessayez dans 15 minutes.", headers={"Retry-After": "900"}
        )


def login(db, request: Request, username: str, password: str):
    check_origin(request)
    username = username.strip().casefold()
    check_login_limit(db, request, username)
    user = db.scalar(select(User).where(User.username == username).with_for_update())
    try:
        hasher.verify(user.password_hash if user else dummy_hash, password)
    except VerificationError:
        raise HTTPException(401, "Identifiants incorrects.") from None
    if user is None:
        raise HTTPException(401, "Identifiants incorrects.")
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(password)
    now = utcnow()
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
    db.execute(delete(LoginLimit).where(LoginLimit.key == digest("account:" + username)))
    db.execute(delete(LoginLimit).where(LoginLimit.expires_at < now - timedelta(days=1)))
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(old)))
    token = secrets.token_urlsafe(48)
    csrf = digest(token + ":csrf")
    session = LoginSession(
        token_hash=digest(token),
        user_id=user.id,
        csrf_hash=digest(csrf),
        expires_at=now + timedelta(hours=request.app.state.settings.session_hours),
    )
    db.add(session)
    db.commit()
    return user, session, token, csrf
