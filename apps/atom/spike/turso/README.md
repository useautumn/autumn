# Turso spike probe (ATMN-650)

Not production code. Measures whether Turso/libSQL replicas could replace the Atom's EBS SQLite store.

- `writer.ts`: upserts Atom-shaped subject rows into the primary and records each ack.
- `reader.ts`: one "Atom" replica, `er` (libSQL embedded replica, `sync()` polling) or `ts` (`@tursodatabase/sync`, long-poll `pull()`); records when each write first becomes visible, final state, and local point-read latency.
- `run.ts <scenario.json>`: writer + N readers, optional `restart` (SIGKILL + reopen) and `blip` (network cut via the `blip` netns from `setup-netns.sh`) faults, then `analyze.ts`.
- `SPIKE_URL=http://127.0.0.1:8089` points everything at a self-hosted `sqld` instead of Turso Cloud.

Tokens are read from `$TURSO_TOKEN_DIR/.tok-<db>` / `.rtok-<db>` (mode 600) and never logged.
