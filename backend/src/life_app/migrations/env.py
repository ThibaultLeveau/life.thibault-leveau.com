"""Alembic uses the same settings and metadata as the application."""

from alembic import context
from sqlalchemy import create_engine, pool

from life_app.apps.registry import APPLICATIONS  # noqa: F401
from life_app.core.config import get_settings
from life_app.core.database import Base
from life_app.platform.applications import models as application_models  # noqa: F401
from life_app.platform.auth import models as auth_models  # noqa: F401


def run(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


external = context.config.attributes.get("connection")
if external is not None:
    run(external)
else:
    settings = get_settings()
    if settings.database_url is None:
        raise RuntimeError("LIFE_DATABASE_URL is required for migrations")
    url = settings.database_url.get_secret_value()
    if context.is_offline_mode():
        context.configure(
            url=url,
            target_metadata=Base.metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
        )
        with context.begin_transaction():
            context.run_migrations()
    else:
        with create_engine(url, poolclass=pool.NullPool).connect() as connection:
            run(connection)
