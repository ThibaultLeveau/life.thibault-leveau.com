#!/usr/bin/env bash
set -Eeuo pipefail
# The application owns its database but cannot administer the PostgreSQL cluster.
psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password LIFE_APP_PASSWORD
CREATE ROLE life LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE life OWNER TO life;
SQL
