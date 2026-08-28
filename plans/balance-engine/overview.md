---
author: Codex
feature: balance-engine
date: 2026-08-28
status: ready-for-review
---

# Balance engine

## Read now

- [The state one customer owns](data-model/runtime-state.md) maps the facts and invariants the runtime must preserve across `check`, `track`, locks, and `attach`.
- [How a check becomes a decision](code-paths/check.md) traces one request through feature and credit resolution, controls, the pure evaluator, and the atomic `send_event` / lock fork.
- [When a track is complete](code-paths/track.md) separates sync response, async acceptance, worker deletion, and eventual projection boundaries, then traces the shared mutation engine underneath them.
- [How attach replaces a live balance](code-paths/attach.md) traces the compute-time A→B intent, concurrent Track rebase, deferred completion, atomic publication, guarded persistence, and cleanup boundary.

This is a map of current behavior. It does not choose Kafka messages, SQLite tables, snapshots, worker APIs, or a migration sequence.

Next: founder review. Once this current-behavior contract is approved, design the engine state and command boundary without reopening what `check`, `track`, or `attach` mean.
