# @autumn/postgres

The shared Postgres client: one Drizzle pool factory over `@autumn/shared`'s
schema, plus per-table repos (one folder per table, one file per query).

`createPostgresDb({ databaseUrl, maxConnections, name })` returns `{ db, client }`.
Consumers own their own memoized accessor and their own `ctx`.

## Planned

- Move `server/src/db/initDrizzle.ts` here, so the server's pools and the
  ledger's pool are the same factory.
- Move `getFullSubjectQuery` here as a repo, so both callers share one query.
