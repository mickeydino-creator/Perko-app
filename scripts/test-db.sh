#!/usr/bin/env sh
# Applies the migrations and seed to a throwaway local Postgres database and checks RLS and the write functions.
# Needs psql and a local Postgres you can create databases on (PGHOST/PGUSER/... as usual).
set -e
cd "$(dirname "$0")/.."
DB=perko_rls_check
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
MIGRATIONS=$(for f in supabase/migrations/*.sql; do printf -- "-f %s " "$f"; done)
# shellcheck disable=SC2086
psql -q -o /dev/null -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/auth_stub.sql $MIGRATIONS -f supabase/seed.sql -f supabase/tests/rls_check.sql
psql -q -d postgres -c "drop database $DB"
