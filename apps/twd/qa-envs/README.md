# qa-envs — per-branch QA environments

A Cloudflare Worker that serves `https://<name>.atmn.lol`, one Durable Object and Container
per env. twd owns create/re-ship/delete (`qa` job, `/api/qa`, MCP `qa_*` tools); this
Worker owns runtime: build, snapshot, wake, idle sleep, Stripe webhook routing, expiry.

```
browser ──► <name>.atmn.lol ──► Worker ──► QaEnv DO ──► Container (snapshot of the built env)
Stripe  ──► hooks.atmn.lol/stripe/connect/sandbox ──► QaRouter (account → envs) ──► QaEnv queue
twd     ──► qa-envs.<subdomain>.workers.dev/__admin/<name>/… (bearer QA_ADMIN_TOKEN)
```

- **Build** (`begin` → `source` → `build`): a separate `build:<env>:<id>` instance starts the
  base image (`container/`, node_modules for the dev lockfile baked in), receives the
  `git archive` tarball, runs `prepare.sh` (install diff, `vite build`, migrations against
  the env's Neon branch) and snapshots. The env adopts the snapshot when it's done, so a
  re-ship keeps serving the old build until then.
- **Wake**: any browser page load (or the waking page's poll, or a queued webhook) restores
  the snapshot; `boot.sh` starts Dragonfly, fakecloud, Kafka, the balance worker, server,
  worker and cron. The env reports ready once the balance worker has claimed every
  partition, so balance commands never see `NO_OWNER`. Scanners can't wake it.
- **Size**: standard-4 (4 vCPU, 12 GiB). Memory and disk are billed while awake on the provisioned
  size, CPU only when used: about $0.22 per env at 30 min/day for 3 days.
- **Sleep** after 5 min without requests; tabs idle for 10 min stop counting.
- **Expiry** after 3 days (reset on re-ship): container, hostname, Stripe routes and Neon
  branch are deleted and the URL answers 410.

## Deploy

```bash
cd apps/twd/qa-envs && bun install
CLOUDFLARE_API_TOKEN=… bun run deploy   # stages the dev lockfile's manifests, builds and pushes the image
```

Secrets (`wrangler secret put`): `QA_ADMIN_TOKEN`, `NEON_API_KEY` (Worker side, deletes expired branches), `CLOUDFLARE_API_TOKEN`
(zone DNS + Workers Routes edit on atmn.lol), `STRIPE_CONNECT_WEBHOOK_SECRET` (the sandbox
platform's Connect endpoint pointing at `hooks.atmn.lol/stripe/connect/sandbox`),
`QA_SHARED_ENV` (JSON of the shared Capy keys; see `src/qaEnv/sharedEnv.ts`).

twd needs `QA_WORKER_URL`, `QA_ADMIN_TOKEN` and `QA_NEON_API_KEY`.

Redeploy after a lockfile change to keep the baked node_modules close to dev (a branch's
diff installs at build time either way). The `durable_object` scheduling policy is in beta.
