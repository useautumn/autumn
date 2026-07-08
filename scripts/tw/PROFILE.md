# `bun tw` modalv2 stage profile

Measured 2026-07-08 on `--provider=modalv2` (the default), us-east-1, 2 workers ×
2 vCPU / 4 GiB, `--per-worker=1`, 2 test files (run `mrbxsqj1-ykbuqm`, branch
`tw-fix4/modal-maxxing`). Boot timings from the `[tw-boot] +Nms` instrumentation,
warm timings from `[tw-warmup] +Ns`, provider stage lines from `[modal] ✓ (+Xs)`.

## Stage table (BEFORE optimization)

| Phase | Stage | Wall | Notes |
|---|---|---|---|
| image | base services image + node_modules + chromium bake | **330s** | first run per lockfile only; Modal content-cache afterwards (~1s) |
| warm | create warm sandbox (V2) | 0.5s | |
| warm | full git clone @ ref | 11.9s | preserves baked node_modules |
| warm | `bun install --frozen-lockfile` (delta) | **71s** | the warm long-pole — lifecycle scripts + relink, even with baked node_modules |
| warm | `bun db migrate --bootstrap` | ~1s | |
| warm | `bun migrate-functions` | ~1s | |
| warm | seed org/products/keys (`setup-test`) | ~3s | |
| warm | clean-stop services | <1s | |
| warm | `snapshotFilesystem` | 15.2s | source + PGDATA diff (node_modules lives in the base layer) |
| **warm total** | *(every run pre-cache)* | **~104s** | plus 330s on a lockfile change |
| fan-out | Stripe sub-accounts (pool of 11 keys, conc 20) | 5s all | parallel with nothing (serialized before each worker's fork) |
| fan-out | `experimentalCreate` from warm image | ~1s/worker | no pacing needed at this width; prior benchmark: ~41s for 100-wide all-READY |
| fan-out | tunnel resolve (restore wait) | ~0s | |
| boot | exec start → `boot.ts` first log | 4.2s | Modal exec round-trip + bun loading boot.ts |
| boot | PG + Dragonfly + goaws up | ~1s | clean-stopped PGDATA, fsync off |
| boot | svix/stripe DB binds | <1s | |
| boot | **bun server module-load → health 200** | **6.6–12.6s** | the boot long-pole at 2 vCPU |
| **boot total** | fork→READY | avg 19s · min 16s · max 22s | |
| run | 2 files | 1m08s wall | test time itself |
| teardown | accounts + sandboxes (conc 16) | ~10s | |

## Top 3 wall-clock costs

1. **Warm build every run (~104s)** — modalv2 had NO cross-run warm cache
   (`getSandboxByName` returned `undefined`, so every `bun tw` re-cloned,
   re-installed, re-migrated, re-seeded, re-snapshotted). Fixed on this branch:
   the warm image is published as `tw-warm:<sha12>` + `tw-warm:latest`
   (account-wide, cross-teammate); an exact hit skips the whole phase, a stale
   hit serves `:latest` with per-worker fast-forward + a detached refresh.
2. **Base image rebuild on lockfile change (330s)** — content-cached otherwise.
   Unavoidable cost when deps change; the warm fast-forward path avoids paying
   it for mere source changes.
3. **Worker boot 16–22s** — dominated by bun loading the server module graph
   (6.6–12.6s at 2 vCPU) plus ~4s exec/bun spin-up. Attacked via boot-time CPU
   sizing (see below); migrate+seed prebaking is NOT worth it (~5s total).

## Non-levers (measured, rejected)

- **Prebaked PGDATA (initdb+migrate+seed in the image):** migrate=1s,
  migrate-functions=1s, seed=3s. ~5s of a 104s phase; the warm cache already
  eliminates all of it on a hit.
- **Fan-out pacing:** V2 create is ~1s/worker with no 429s at this width;
  us-east-1 held ~1s/create at N=100 in prior benchmarks.
- **Memory snapshots:** not supported on Sandboxes V2 (SDK + docs). The
  freestyle-style "restore a running server" path is unavailable on Modal today.

## AFTER — measured on this branch

### Warm cache (published images, freestyle-style)

| Scenario | Warm phase | Evidence |
|---|---|---|
| exact hit (`tw-warm:<sha12>` published) | **~1s** (one `images.fromName`) | run 4/6: "warm cache HIT … skipping the entire warm build", 5 workers READY in 20–21s from fan-out start |
| stale hit (`:latest`, new commit) | **~1s** + ~6s per-worker fast-forward checkout (parallel, inside the fork slice) | run 3/5: "stale warm hit … workers fast-forward at boot", READY in 22–23s; detached refresh converged + re-published mid-run |
| miss (no images at all) | ~104s full build, then published | run 2 |
| `refresh-warm --provider=modalv2` (converge CI-style) | 84s total (fast-forward create 7.3s + warmup 66s + snapshot/publish 9.3s) | tw-refresh1 |

### Boot CPU sizing (5 workers, exact-hit, in-sandbox `[tw-boot]` timestamps)

| CPU | boot.ts→server spawn | server load→health | in-sandbox total |
|---|---|---|---|
| 2 vCPU | ~5.1s | ~6.5s | ~11.7s |
| 8 vCPU | ~3.2s | ~6.5s | ~9.8s |

~2s saved at 4× cost — the server module-load doesn't parallelize. Default stays
2 vCPU; `TW_MODAL_WORKER_CPU/_MEM_MIB` remain the knobs.

### Warm-refresh install skip (measured)

`bun install --frozen-lockfile` costs ~65s even when NOTHING changed (relink
scan). warmup.sh now stamps the lockfile sha (`$TW_PREFIX/bun-lock.sha256`) and
skips the install when it matches: warmup.sh 66.8s → **6.0s**; a full
`refresh-warm` (new commit, same lockfile) 83.5s → **24.4s**. Warm cache misses
on new commits now cost ~25s instead of ~104s, and in-run background refreshes
finish well within a normal test run.

### 40-wide validation (fan-out empirics)

`core --max=40 --per-worker=1 --fanout-bench`, exact warm hit: Stripe accounts
all created in 11s (conc 20, 11 pool keys) · fork ~1s/worker (V2, no pacing, no
429s) · restore ~0s · boot avg 14s (12–18s) · **40/40 READY in 29s from fan-out
start**, zero provision failures. No pacing needed at this width.

### Expected 200-wide timeline (invocation → tests executing)

| Stage | Cached/typical | Notes |
|---|---|---|
| resolve + preflight + key-pool probe | ~5-10s | |
| warm lookup | ~1s | published-image hit (exact or stale) |
| ingress + Connect webhooks | ~15s | |
| Stripe sub-accounts ×200 | ~15-20s | conc 20 across 11 pool keys |
| fork ×200 (V2, no pacing) | ~1s each, parallel | 40-wide measured: all READY in 29s; prior 100-wide ~41s |
| boot ×200 (parallel) | ~12-20s each | stale adds ~6s ff |
| **invocation → tests executing** | **~60-90s** | was ~3-4 min (warm rebuild every run) |

