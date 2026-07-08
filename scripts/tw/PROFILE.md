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

*(AFTER numbers for the warm cache + boot CPU experiments are appended below as
they are measured.)*
