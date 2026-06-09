# `bun db` — Drizzle Migration CLI

Unified entrypoint for everything migration-related. Subcommands route through `scripts/db/index.ts`, which auto-wraps DB-touching subcommands in `infisical run` so `DATABASE_URL` is injected from the right secret environment.

## Surface

```
bun db help                                   # print usage
bun db generate                               # write a new migration .sql from schema changes
bun db migrate       [--env=dev|staging|prod] # apply pending migrations to the target DB
bun db migrate:dry   [--env=dev|staging|prod] # preview pending SQL + safety checks, don't apply
bun db mark-applied  [--env=dev|staging|prod] # seed drizzle.__drizzle_migrations on an existing DB
bun db rebase                                 # auto-resolve a local migration that collided with origin/dev
```

`migrate` applies pending migrations directly via `pg` (using drizzle's own `readMigrationFiles` for parsing + hashing), so the tracking table stays compatible with drizzle and `mark-applied`. Unlike drizzle's built-in `migrate()` — which wraps every migration in a single transaction — our executor runs any statement containing `CONCURRENTLY` in autocommit, so `CREATE INDEX CONCURRENTLY` migrations apply normally. Everything else still runs in a per-migration transaction.

`migrate` and `migrate:dry` also run a safety check that **refuses to apply any pending migration containing `CREATE INDEX`, `DROP INDEX`, or `REINDEX` without `CONCURRENTLY`**. Those DDL statements take an ACCESS EXCLUSIVE lock and can block reads/writes on busy tables. To get through the check, make the index concurrent: rewrite the SQL with `CONCURRENTLY`, or add `.concurrently()` to the index in your schema and regenerate. Concurrent index migrations then apply through `bun db migrate` with no manual step.

`--env` defaults to `dev`. `generate` and `rebase` never touch a DB and don't take `--env`.

---

## Day-to-day workflow

```bash
# 1. Make a schema change in shared/db/**.ts or shared/models/**.ts
# 2. Generate the migration
bun db generate

# 3. Review the new shared/drizzle/{N}_*.sql and updated meta/.
#    Commit both with the code change in your PR.

# 4. Apply locally
bun db migrate
```

If your branch's migration collides with one that landed on `origin/dev` first (CI will tell you via duplicate-idx errors), pull and run:

```bash
git pull origin dev
bun db rebase     # auto-renumbers your migration, regenerates against the new baseline
```

`bun db rebase` is idempotent and bails out cleanly if drizzle-kit would need interactive input (e.g. column rename detection) — see the "Edge cases" section below.

---

## Bootstrapping a new DB

`bun db migrate` won't run against a DB that has the tables but no `drizzle.__drizzle_migrations` tracking row — it'd try to `CREATE TABLE` on tables that already exist and fail. Seed the tracking table first:

```bash
bun db mark-applied                  # local dev DB
bun db mark-applied --env=staging    # if/when staging is wired up — see below
bun db mark-applied --env=prod       # if/when prod is wired up — see below
```

Idempotent. Re-running is safe.

---

## Status: staging & prod are NOT wired into the CLI yet

**Right now, staging and prod migrations are still applied manually (paste the `.sql` into TablePlus per env).** The `--env=staging|prod` plumbing exists in the code and works, but we haven't:

1. Run `bun db mark-applied --env=staging` / `--env=prod` to seed the tracking table on those DBs.
2. Switched the deploy pipeline to call `bun db migrate --env=…` automatically.

Until both happen, **do not run `bun db migrate --env=staging` or `--env=prod`** — without the mark-applied step, it will try to re-create existing tables and fail. (Failing safely, but failing.)

---

## Upgrade path: moving staging / prod into the CLI

When you're ready to flip from "TablePlus paste" to automated migrations on a shared env, the sequence is:

### One-time per env

1. **Confirm the env's secret name in infisical.** The CLI assumes:
   - `dev` → infisical env `dev`, `ENV_FILE=.env`
   - `staging` → infisical env `staging`, `ENV_FILE=.env.staging`
   - `prod` → infisical env `prod`, `ENV_FILE=.env.prod`

   This mapping lives in `scripts/db/helpers/env.ts`. If your infisical env names diverge, update there.

2. **Confirm `DATABASE_URL` in that infisical env points at the right DB.** A wrong URL here means migrations apply to the wrong DB. Run:

   ```bash
   bun db mark-applied --env=<env>
   ```

   The first log line prints the host parsed from `DATABASE_URL` (e.g. `host=staging-pg.foo.com:5432`) — verify it before letting the script run further. Hit Ctrl-C if it's wrong; mark-applied does its writes after the log line.

3. **Run mark-applied.** Same command as step 2. It seeds `drizzle.__drizzle_migrations` with rows for every migration currently in `shared/drizzle/meta/_journal.json`, so `db migrate` will skip them.

4. **Verify migrate is a clean no-op.** This proves the seeding worked:

   ```bash
   bun db migrate --env=<env>
   ```

   Expected: drizzle-kit reports "applied successfully" with no DDL run, and `drizzle.__drizzle_migrations` has the same row count as before.

### Ongoing — moving the apply step from TablePlus to the CLI / CI

Once the bootstrap above is done for an env, you have two ways to apply new migrations:

- **Manual command**, same shape as dev:
  ```bash
  bun db migrate --env=staging
  bun db migrate --env=prod
  ```

- **CI-based** — call the same command from a deploy step. Two things to wire up in the pipeline:

  1. The CI runner needs `infisical` installed and authenticated with credentials that can read the relevant env. Existing workflows that use `infisical run --env=…` are the precedent; copy that auth setup.
  2. Add a step like:
     ```yaml
     - name: Apply DB migrations
       run: bun db migrate --env=prod
     ```
     after the build step and before traffic is shifted to the new revision. If the migration fails, the deploy should halt — `bun db migrate` exits non-zero on any DDL failure.

  Recommendation: **start with staging-only CI migration first**, run it for a week or two, and only then enable prod. Prod migration failures during a deploy are high-blast-radius and you want to be confident the pipeline works before you bet a deploy on it.

---

## File layout

```
scripts/db/
├── README.md              # this file
├── index.ts               # subcommand dispatch
├── commands/
│   ├── help.ts
│   ├── generate.ts        # passthrough to `bun -F @autumn/shared db:generate`
│   ├── migrate.ts         # applies pending migrations (CONCURRENTLY-aware executor)
│   ├── markApplied.ts     # seeds drizzle.__drizzle_migrations
│   └── rebase.ts          # auto-resolves duplicate-idx conflicts
├── helpers/
│   ├── applyMigrations.ts # per-migration executor: autocommit for CONCURRENTLY, tx otherwise
│   ├── env.ts             # --env parsing + infisical wrap + DATABASE_URL host extraction
│   ├── pendingMigrations.ts # computes pending set from _journal.json vs tracking table
│   ├── safetyCheck.ts     # flags non-CONCURRENTLY index DDL
│   ├── paths.ts           # canonical paths to shared/drizzle/ and meta/
│   └── spawn.ts           # thin child_process.spawn wrapper
└── pull.ts                # unrelated — customer data pull (legacy)
```

`shared/package.json` still owns `db:generate` (which `generate` shells out to). `migrate` no longer delegates to drizzle-kit — it reads the committed migrations with drizzle's `readMigrationFiles` and applies them itself so `CONCURRENTLY` works. The unified `bun db` interface lives at the repo root.

---

## Edge cases

### `bun db rebase` bailed with "drizzle-kit needs interactive input"

This happens when the regeneration would prompt for a rename decision (column renamed, enum value reordered, etc.). The script restored your original files from a temp backup and exited non-zero. Recovery:

1. `bun db generate` directly in a terminal — answer the prompts.
2. Drizzle will produce a new migration. If it has a duplicate idx with `origin/dev`, manually rename the `.sql` file and update the `idx` + `tag` in `meta/_journal.json`.
3. Re-run `bun db rebase` to confirm the journal is now clean.

This is rare. ~95% of migrations (ADD COLUMN, DROP COLUMN, CREATE INDEX) auto-resolve cleanly.

### CI says "migration idx N already exists"

Someone else's PR with the same migration idx merged first. Run `bun db rebase` on your branch, push, re-run CI.

### "I deleted shared/drizzle/ by accident"

Pull from `origin/dev` to get it back. Your in-flight schema changes in TS are still intact; run `bun db generate` and it'll regenerate the migration.
