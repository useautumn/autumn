# Migration retry experiments

These tasks run only on the `zagreb-migration-recovery-experiment` Trigger development branch. The normal deployment config does not index this directory. All customers here are synthetic rows in the isolated worktree's `recovery_probe` schema; this is not a production load test.

## Run

From the repository root, after worktree setup and local migration application:

```sh
bun -e 'import {parse} from "dotenv"; import {readFileSync,writeFileSync} from "node:fs"; const e=parse(readFileSync("server/.env.local")); writeFileSync(".context/migration-recovery-experiment.env", `MIGRATION_RECOVERY_DATABASE_URL=${e.DATABASE_URL}\nMIGRATION_RECOVERY_REDIS_URL=${e.REDIS_URL}\n`, {mode:0o600});'

bunx trigger.dev dev start --config server/experiments/migrationRecovery/trigger.config.ts --branch zagreb-migration-recovery-experiment --env-file .context/migration-recovery-experiment.env --max-concurrent-runs 4 --skip-update-check
```

In another terminal, run at most three cases per invocation:

```sh
infisical run --env=dev --recursive -- bun --env-file=.context/migration-recovery-experiment.env server/experiments/migrationRecovery/runProbe.ts parent-retry lost-result redis-retry > /tmp/migration-trigger-boundary.log 2>&1

infisical run --env=dev --recursive -- bun --env-file=.context/migration-recovery-experiment.env server/experiments/migrationRecovery/runProbe.ts crash child-failed manual-replay > /tmp/migration-trigger-replay.log 2>&1

infisical run --env=dev --recursive -- bun --env-file=.context/migration-recovery-experiment.env server/experiments/migrationRecovery/runProbe.ts saved-error saved-crash > /tmp/migration-trigger-saved-result.log 2>&1
```

The CLI requires a Trigger login; the runner requires the development `TRIGGER_SERVER_SECRET_KEY`. Neither task payloads nor recorded evidence contain credentials. Restart the experiment worker after changing task code, and check its ready version before running. Stop this worker after testing; leave the ordinary worktree stack running.

## Observed on SDK/CLI 4.5.10

| Case | Observed behavior |
|---|---|
| `parent-retry` | Parent attempted twice; completed SQL child ran once |
| `lost-result` | SQL committed, task threw, retry returned an empty changes array |
| `redis-retry` | Redis timed out through local proxy; cache task retried without repeating SQL |
| `crash` | Task process exited after commit; next attempt returned an empty changes array |
| `child-failed` | Child exhausted retries; parent retry created a new child run |
| `manual-replay` | New parent run repeated SQL; parent-scoped child key did not reuse the old result |
| `saved-error` | Saved result survived an exception; SQL callback ran once |
| `saved-crash` | Saved result survived process exit; SQL callback ran once |

`runProbe.ts` asserts these outcomes and prints synthetic attempt evidence. Baseline cases deliberately demonstrate lost output; the command succeeds when that failure mode is reproduced. The `saved-*` cases use the production `withMigrationBatchResult` helper against synthetic SQL. Real customer-product repointing is covered separately by `migration-batch-result.test.ts`.

Task-process exit is a development-worker crash experiment, not proof of every cloud infrastructure failure mode. Key expiry is documented by Trigger but was not tested by waiting seven days. The experiments do not establish production scheduling overhead or API latency.

## One-batch contract

`withMigrationBatchResult` inserts a result row, performs bounded SQL, and saves the JSON result in one transaction. A duplicate identity waits at the unique constraint, then reads that committed result. A rollback removes both the mutation and the result row. Reusing the same identity with different JSON input fails.

The caller must supply a stable logical batch identity and all frozen execution inputs, including timestamps when relevant; an attempt ID is not a batch identity. The callback must use its supplied transaction and perform SQL only. This does not yet define multi-batch continuation, historical reconciliation, retention, or webhook submission.
