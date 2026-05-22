# Migration Runs `target_limit` Dev DB Note

While writing the automatic-tax missing-address regression test, the integration
harness could not reach billing setup because the dev database schema was behind
the checked-in Drizzle model.

## Symptom

Running:

```bash
cd server
./run.sh /Users/amianthus/.superset/worktrees/06ef6d27-730a-4eec-a0b1-3f2853221478/fix/automatic-tax-retry/server/tests/integration/billing/tax/automatic-tax-no-address-error.test.ts
```

failed during setup with:

```text
error: column organizations_migration_runs.target_limit does not exist
code: "internal_error"
```

This happened before the test reached customer/product billing behavior.

## Investigation

The checked-in table model is:

```text
shared/models/migrationV2Models/migrationRunTable.ts
```

It defines:

```ts
export const migrationRuns = pgTable(
  "migration_runs",
  {
    ...
    target_limit: numeric({ mode: "number" }),
    ...
  },
);
```

The actual dev DB had `migration_runs`, not `organizations_migration_runs`.
I verified with:

```bash
infisical run --env=dev --recursive -- bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!); const rows = await sql`select table_schema, table_name from information_schema.tables where table_name like ${"%migration%run%"} order by table_schema, table_name`; console.log(rows); await sql.end();'
```

which returned:

```text
public.migration_item_runs
public.migration_runs
```

The `organizations_migration_runs.target_limit` wording appears to be a SQL
alias/prefix in the failing query, not the physical table name.

## Temporary Local Fix Applied

I first tried the alias-looking table name:

```bash
infisical run --env=dev --recursive -- bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!); await sql`ALTER TABLE organizations_migration_runs ADD COLUMN IF NOT EXISTS target_limit numeric`; await sql.end(); console.log("added target_limit if missing");'
```

That failed with:

```text
PostgresError: relation "organizations_migration_runs" does not exist
code: "42P01"
```

Then I applied the actual checked-in table name:

```bash
infisical run --env=dev --recursive -- bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!); await sql`ALTER TABLE migration_runs ADD COLUMN IF NOT EXISTS target_limit numeric`; await sql.end(); console.log("added migration_runs.target_limit if missing");'
```

That succeeded:

```text
added migration_runs.target_limit if missing
```

After that, the automatic-tax test reached the intended billing failure.

## Follow-up Needed

Create/apply the real migration for `migration_runs.target_limit` so future
agents and dev environments do not need the manual `ALTER TABLE`.
