#!/usr/bin/env sh
# Applies the migration and seed to a throwaway local Postgres database and checks RLS and the write functions.
# Needs psql and a local Postgres you can create databases on (PGHOST/PGUSER/... as usual).
set -e
cd "$(dirname "$0")/.."
DB=perko_rls_check
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -o /dev/null -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/auth_stub.sql -f supabase/migrations/*_init.sql -f supabase/seed.sql -f supabase/tests/rls_check.sql
psql -q -d postgres -c "drop database $DB"
