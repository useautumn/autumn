# Run sizing

`planRunSizing` picks **files per worker (k)** and **workers (W)** once per run, just before it queues for accounts. `get_run.sizing` shows the decision and the reasons behind it.

| Request | k | W |
|---|---|---|
| `maxWorkers` | 1 | min(files, maxWorkers, keys × 4) — the old behaviour |
| `maxFilesPerWorker` | as given (main shard) | ⌈packed / k⌉ + solo + capability files |
| neither (**Auto**, default, baselines) | from profiles, below | LPT, below |

Auto with no `file_profiles` rows yet behaves exactly like the old default: one worker per file.

## Files per worker (Auto)

A main-shard file can be **packed** only when:
- it has its own profile with Stripe, CPU and memory stats
- it isn't **solo**:
  - **static:** `detectSoloFiles` matches org config, org cache, edge config or rate limits, rollout flags, shared features, or a `// tw:solo` marker
  - **learned:** its `packedFailRate` is more than 0.2 above its `failRate`. `packedFailRate` is an EWMA with alpha 0.5 over first attempts that shared a worker, so a single packed failure is enough. Once a file is solo it never shares a worker again, so this sticks until its profile is reset.
- it isn't **heavy**: on every resource, its own load is at most half of what a worker has spare

Per file, from its profile measured at k = 1:

| resource | per-file load | per-worker ceiling C |
|---|---|---|
| Stripe rps | `stripeMeanRps` | min(limiter rps budget, 5 per connected account, 25 Stripe sandbox) |
| Stripe in-flight | `stripeMeanInFlight` (network time ÷ wall) | min(limiter in-flight budget, 5) |
| CPU cores | worker cores during the file − O_cores | worker cores (2) |
| Memory MiB | max(test RSS, worker peak − O_mem) | worker memory (4096) |

Overheads come from the measurements themselves:
- **O_cores** = p10 of worker-wide cores. Postgres, Dragonfly and the server count once per worker.
- **O_mem** = p10 of (worker peak − test RSS).

Worker-wide memory is cgroup `memory.current`, falling back to `/proc/meminfo`. So Postgres and Dragonfly growth caused by a file is part of its load.

**k** is the largest value from 1 to 4 where every resource passes:

```
O + k·μ + 2·√k·σ  ≤  h · C          h = 0.65
```

μ and σ are taken over the packable files. The first resource that fails at k + 1 is reported as `binding`. The Stripe limiter budgets in `stripeBudget.ts` are unchanged: packing has to fit inside them, it doesn't raise them.

## Workers (Auto)

```
T   = 1.05 × the longest file's p90         (wall stays the longest file)
W_s = ⌈1.3 × min{ W : LPT makespan of shard s on W·k_s slots ≤ T }⌉ + ⌈1.5 · Σ failRate⌉
W   = Σ_s W_s, capped by keys × 4
```

- Each shard is sized on its own: main (k), solo (1), and each capability shard (1, capped by its `maxWorkers`).
- Files are already dispatched longest-first by baseline p90, so the LPT model matches what the swarm does.
- `1.3` covers boot stagger (workers arrive over about 45 s) and estimate error. Lower it once runs show parity.

## Isolation on a shared worker

Packed files share one Postgres, one Dragonfly, one server, one connected Stripe account and the single test org. That is why:
- org-wide mutations always run solo (above);
- a rerun on a packed shard takes a whole worker to itself (`WorkerPool` exclusive acquire), so co-tenants can't fail it twice;
- Dragonfly runs with an explicit `--maxmemory` (`DRAGONFLY_MAXMEMORY`, default 1gb) and no eviction, so a full cache fails loudly instead of silently dropping test state.
