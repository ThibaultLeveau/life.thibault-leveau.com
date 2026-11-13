"""Explicit migrations and account administration, without a public registration API."""

import argparse
import getpass
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from life_app.core.config import get_settings
from life_app.features.auth.models import LoginSession, User
from life_app.features.auth.service import hasher


def migration_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    return config


def main():
    parser = argparse.ArgumentParser(description="Administration de Life")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="Appliquer les migrations jusqu'à head")
    for name in ("create-user", "reset-password"):
        account = sub.add_parser(name)
        account.add_argument("username")
        account.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()
    if args.command == "migrate":
        command.upgrade(migration_config(), "head")
        print("Migrations appliquées.")
        return
    settings = get_settings()
    if settings.database_url is None:
        parser.error("LIFE_DATABASE_URL est requis")
    username = args.username.strip().casefold()
    if not username or len(username) > 80:
        parser.error("Identifiant requis, 80 caractères maximum")
    password = (
        sys.stdin.readline().rstrip("\r\n")
        if args.password_stdin
        else getpass.getpass("Mot de passe (12 caractères minimum) : ")
    )
    if not 12 <= len(password) <= 1024:
        parser.error("Le mot de passe doit contenir entre 12 et 1024 caractères")
    if not args.password_stdin and password != getpass.getpass("Confirmer : "):
        parser.error("Les mots de passe ne correspondent pas")
    engine = create_engine(settings.database_url.get_secret_value())
    try:
        with Session(engine) as db, db.begin():
            user = db.scalar(select(User).where(User.username == username).with_for_update())
            if args.command == "create-user":
                if user is not None:
                    parser.error("Ce compte existe déjà")
                db.add(User(username=username, password_hash=hasher.hash(password)))
            else:
                if user is None:
                    parser.error("Compte introuvable")
                user.password_hash = hasher.hash(password)
                db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
        print(
            "Compte créé."
            if args.command == "create-user"
            else "Mot de passe remplacé, sessions révoquées."
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
