# @autumn/ledger

The Subject Engine service. `POST /commands` hands each command to its shard's
single writer loop, which folds it against in-memory SQLite state, appends to the
journal, commits, and replies. The fold, the Redpanda journal, and the Postgres
import are scaffolded placeholders that answer 501 today.

## Run

```sh
bun dev            # from apps/ledger
curl localhost:7000/health
```

## Env

- `DATABASE_URL` — Postgres, used by the (not yet built) subject import.
- `LEDGER_PORT` — default `7000`.
- `LEDGER_LOG_DATASET` — Axiom dataset, default `ledger`.

## Logs

`preset: "firelens"` — in ECS the logger writes JSON to stdout and the FireLens
sidecar routes `source_type ledger` to Axiom's `ledger` dataset (see
`firelens.conf`). Everywhere else it behaves like the `default` preset.
