# Capy v2 development environment

Autumn runs end-to-end in Capy v2 VMs using project-level **Setup**. Capy owns
the VM lifecycle, Docker provides local infrastructure, and Neon provides an
isolated database branch for each VM.

## Setup lifecycle

Configure this repository under **Settings → Project → Dev environment**:

| Lifecycle | Command | Responsibility |
| --- | --- | --- |
| Initialize | `bash scripts/setup/capy-init.sh` | installs workspace dependencies, refreshes repo-pinned AI skills in `.agents/skills/`, installs the [memory bubble](#memory-bubble), `neonctl`, the pinned Stripe CLI and native Kafka, then pulls the Autumn and Trigger.dev infrastructure images for snapshot reuse |
| Update after checkout | `bash scripts/setup/capy-init.sh` | re-runs the same deterministic refresh so reused or snapshotted VMs pick up pinned skills and tooling after checkout |
| Startup | `bash scripts/setup/capy-startup.sh` | idempotently re-applies the [memory bubble](#memory-bubble), starts local infrastructure, provisions or resumes the VM's Neon branch, applies pending migrations and SQL functions, and writes local env files. Starts no app processes |
| App (on demand) | `bun capy` | runs Startup (a near no-op when it already ran this boot) and starts the app in a detached tmux session |

Initialize does not start services or create per-VM state, so it is safe to run
during a snapshot build. Startup is blocking but bounded: its containers detach,
its readiness checks finish, and the script exits as required by Capy v2.

## The app is lazy

Every Capy sleep is a reboot, so Startup only prepares the machine. Nothing
listens on :3000 or :8080 until an agent asks for it. Editing code,
typechecking and unit tests need nothing more. Start the app only when the task
needs it:

| Need | Command | Runs |
| --- | --- | --- |
| Integration tests (`bun t`) | `bun capy --server-only` | server, workers, cron, balance worker, `stripe listen` and backend opt-ins; no Vite or other frontends |
| Dashboard, browser, webhooks by hand | `bun capy` | the full slim stack; expose port 3000 afterwards |
| Stop the app, keep infra and DB | `bun capy stop` | kills the tmux session and every process under it |
| Fresh start | `bun capy teardown` | see below |

Integration tests talk to the server over HTTP on :8080 (Stripe webhook tests
also need `stripe listen`), so they fail with "Unable to connect" against
Startup alone. `bun t` prints a warning when the server is down on Capy. Unit
tests need only Startup. A full `bun capy` replaces a running server-only stack;
`bun capy --server-only` keeps a running full stack, since it is a superset.

Startup and `bun capy` share a lock (`~/.autumn-capy/startup.lock`), so an
agent that runs `bun capy` while the boot's Startup is still going waits for
it. Provisioning then records a fingerprint in `~/.autumn-capy/provisioned`:
the boot id, machine id, Trigger opt-in, migrations, SQL functions and
`.env.local` contents. A later run with the same fingerprint skips Neon,
migrations and setup-test after re-checking the infra, so `bun capy` only adds
the app. A reboot, a pulled migration or an edited env file re-provisions;
`bash scripts/setup/capy-startup.sh --force` always does.

Measured on a Capy VM with the branch already provisioned:

| | Before | After |
| --- | --- | --- |
| Startup (provision only) | 27 s | 25 s first run, 1.8 s repeat in the same boot |
| `bun capy` after Startup | 47 s (re-provisioned) | 22 s full, 16 s `--server-only` |
| Memory used, infra only | | 1.3 GB |
| Memory used, server-only / full app | 4.1 GB full | 3.5 GB / 4.1 GB |

## Memory bubble

Capy VMs are 2 vCPU / 8 GB with no swap. Without help, a process that eats the
last of RAM makes the kernel thrash page cache for minutes instead of killing
anything: on 8 GB, `tsgo --build` in `server/` beside `bun capy --server-only`
froze the machine for 845 s (one stall of 175 s) and every agent command timed
out. `scripts/setup/capy-bubble.sh` makes the greedy process die instead. Both
Initialize and Startup install it, so snapshots carry it and older machines get
it on their next wake:

| Piece | What it does |
| --- | --- |
| earlyoom | Sends SIGTERM to the process with the highest OOM score once `MemAvailable` drops to 256 MiB, SIGKILL at 128 MiB. `tsgo`/`tsc` are preferred; the Capy machine server (`MainThread`), envd, kappu, Xvfb, Docker, tmux, sshd and systemd are avoided. Config: `/etc/default/earlyoom` |
| `capy-bubble.service` | Boot oneshot that sets `system.slice` `MemoryMax` to MemTotal minus 256 MB and `MemorySwapMax=0`. A backstop for when earlyoom misses: the kernel OOM-kills inside the slice instead of thrashing the whole VM |
| `capy-machine-server.service.d/oom.conf` | `OOMPolicy=continue`. Without it one OOM kill inside the machine server stops the server and every agent command with it |

What gets killed is whatever is largest when memory runs out, nearly always the
typecheck (`tsgo` peaks around 6.6 GB). If the app itself is the largest
process, earlyoom can kill the server's `bun` process; `bun capy` brings it
back. The full stack (`bun capy`) already uses about 6.5 GB on 8 GB, so run
typechecks with the app stopped (`bun capy stop`) or with `--server-only`.

Measured on an 8 GB VM (worst stall is the longest the machine stopped
scheduling a 250 ms timer):

| Scenario | Without bubble | With bubble |
| --- | --- | --- |
| Fast memory bomb, idle machine | kernel OOM after 6 s, worst stall 1.6 s | earlyoom kill in 3 s, worst stall 0.02 s |
| `--server-only` + server `tsgo` + git churn | 845 s thrash, worst stall 175 s, nothing killed | `tsgo` killed in 23–43 s, worst stall 0.11 s |
| Full `bun capy` + server `tsgo` | 300 s thrash until the test timeout, worst stall 90 s, nothing killed, agent commands timed out | `tsgo` killed in 8 s, worst stall 0.11 s, dashboard and API still 200 |

The cgroup cap alone does not fix slow growth (`tsgo` with earlyoom off and a
256 MB reserve: 140 s with stalls up to 22 s before the kernel killed it), so
earlyoom does the real work. Tune with `CAPY_BUBBLE_RESERVE_MB` and
`CAPY_BUBBLE_EARLYOOM_MIN_KIB` when rerunning Startup. Check the state with
`systemctl show -P MemoryMax system.slice`, `systemctl is-active earlyoom` and
`sudo journalctl -u earlyoom`.

## Teardown

`bun capy teardown` returns the machine to its pre-Startup state: it stops the
app, deletes this machine's Neon branch, removes the `autumn-capy` and
`autumn-capy-trigger` Compose projects with their volumes, stops Kafka and
deletes its data, deletes `.data/atom`, the generated `.env.local` files and
everything under `~/.autumn-capy` except the opt-in markers. The next
`bun capy` (or Startup) rebuilds from scratch on a fresh branch (same name) off
`dw-template`; that takes about two minutes. Teardown refuses to run while
Startup holds the lock.

Each `capy-<hash>` branch self-deletes 14 days after it was created; the
expiry is fixed at creation and not extended on wake, so a machine idle that
long starts with a fresh database on its next Startup.

The old `.capy/settings.json` terminals and previews are intentionally gone.
Project Setup is authoritative in v2, and Capy discovers listening HTTP services
automatically.

## Required environment variable

Add this under **Settings → Project → Environment variables**:

| Name | Used by | Required |
| --- | --- | --- |
| `NEON_API_KEY` | `neonctl` in `scripts/capy/provision.ts` | yes |

Use a shared value when Startup must work for every team member and snapshot-
restored VM. Keep the value in Capy's environment settings; never put it in a
Setup command or repository file.

Optional integration variables such as `STRIPE_SANDBOX_SECRET_KEY`,
`STRIPE_SANDBOX_WEBHOOK_SECRET`, `STRIPE_SANDBOX_CLIENT_ID`,
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `POSTHOG_API_KEY`, and
`SLACK_BOT_TOKEN` pass through when configured. `STRIPE_SANDBOX_SECRET_KEY`
authenticates the Stripe CLI without interactive login.

## Runtime services

Startup launches Dragonfly and fakecloud from `scripts/setup/dw.compose.yml`
and a native Apache Kafka broker from `scripts/setup/capy-kafka.sh`. The
Trigger.dev control plane in `scripts/setup/trigger.compose.yml` starts only
when opted in (see below); otherwise Startup stops its containers:

| Port | Service |
| --- | --- |
| 4566 | fakecloud (SQS, EventBridge Scheduler, DynamoDB) |
| 6379 | Dragonfly |
| 8030 | Trigger.dev webapp and API |
| 19092 | Kafka (plaintext, loopback only) |

Kafka runs as a JVM process, not a container. Initialize installs Kafka 3.9.1
into `~/.cache/autumn-capy/`, and Startup formats it once and keeps its data,
pid and log in `~/.autumn-capy/kafka/`. `server/.env.local` gets
`KAFKA_BROKERS=127.0.0.1:19092` and `KAFKA_AUTH_MODE=none`, so the dev server,
balance worker and `bun t` all reach it without MSK auth.

Trigger.dev runs a control plane matching the exact `trigger.dev` version in
the root `package.json`. Startup creates its datastore credentials in
`~/.autumn-capy/trigger.env`, seeds the matching Autumn project, and writes
`TRIGGER_API_URL`, `TRIGGER_ACCESS_TOKEN`, and `TRIGGER_SERVER_SECRET_KEY` into
`server/.env.local`. `bun dev` therefore keeps using the repository's existing
local Trigger worker, but its queues and run data are isolated to this VM
instead of the shared Trigger.dev cloud project.
The control plane uses about 2.4 GB of RAM, so it is opt-in.

## Slim stack and opt-ins

`bun capy` starts a slim stack by default: Vite, the server, one worker
process, cron, the balance worker and `stripe listen` (about 4.5 GB used on a
16 GB VM, versus 11.5 GB for the full stack). Opt-ins are marker files in
`~/.autumn-capy/opt-ins/`, toggled with `bun capy restart --<name>` and
`bun capy restart --no-<name>`:

| Opt-in | Adds |
| --- | --- |
| `trigger` | Trigger.dev control plane and the `trigger dev` worker |
| `eve` | Eve and leaf/chat |
| `checkout` | Checkout app |
| `atom` | Herald and the local Atom stand-in |
| `alien` | `ALIEN_API_KEY` in the stack's environment |

On Capy the dashboard also keeps Vite's dependency cache across restarts,
serves `@autumn/shared` as one incrementally rebuilt bundle
(`vite/viteSharedBundle.ts`), and watches files with inotify instead of
polling.

Ports the app uses once started:

| Port | Application |
| --- | --- |
| 3000 | Vite dashboard |
| 3001 | Checkout |
| 3099 | Leaf/chat |
| 8080 | Autumn server |

Capy v2 no longer reserves port 8080 for the desktop. The generated env files
therefore use Autumn's standard `http://localhost:8080` and
`http://localhost:3000` URLs. Capy's Desktop services menu detects these ports
without repository preview configuration.

## Opt-in infra

Some infra only runs on a sandbox that asks for it. Pass `--<name>` once and
`bun capy` keeps it on through sleep and reboot, via a marker file in
`~/.capy/work/autumn-capy/opt-ins/`. `--no-<name>` turns it off. Changing an
opt-in restarts the stack.

| Opt-in | Off (default) | On |
| --- | --- | --- |
| `alien` | `ALIEN_API_KEY` is withheld, so `byoc.create_atom` uses the local Atom | The server deploys Atoms through hosted Alien |

```sh
bun capy --alien      # real-cloud Atom from now on
bun capy --no-alien   # back to the local Atom
```

## Provisioning model

`scripts/capy/provision.ts` derives the machine id from Capy's per-machine
`bindingId` (off Capy it mints one into `~/.autumn-capy/machine-id`) and hashes
it into a `capy-<hash>` Neon branch name. Non-secret branch metadata plus
generated local auth secrets live in the mode-`0600` file
`~/.autumn-capy/state.json`; state baked into a snapshot by another machine is
ignored. A resumed VM reuses its branch. Hostnames are not used: VMs cloned
from one image share a hostname, which previously collapsed every machine onto
one shared branch.

The script writes managed values into:

- `server/.env.local`
- `vite/.env.local`
- `apps/checkout/.env.local`

The Bun preload in `scripts/preload-env.ts` loads those files for direct commands,
so Capy does not need Infisical for the local stack.

## Logs

Startup appends all output to `~/.autumn-capy/startup.log` (or
`$CAPY_PREFIX/startup.log` when `CAPY_PREFIX` is set). Each run has a UTC
delimiter, including failures before tmux or the application starts. The app
process writes to `~/.autumn-capy/app.log` (or `$CAPY_PREFIX/app.log`), which is
truncated only when a new app session launches. Both files are mode `0600`.

Use `bun capy logs` to print the Startup log followed by the app log. It works
after a Startup failure before the tmux session exists; when `app.log` is absent,
it uses tmux's capture pane only as a fallback.

## Troubleshooting

Inspect local infrastructure with:

```bash
docker compose -f scripts/setup/dw.compose.yml -p autumn-capy ps
docker compose -f scripts/setup/dw.compose.yml -p autumn-capy logs
docker compose --env-file ~/.autumn-capy/trigger.env \
  -f scripts/setup/trigger.compose.yml -p autumn-capy-trigger ps
docker compose --env-file ~/.autumn-capy/trigger.env \
  -f scripts/setup/trigger.compose.yml -p autumn-capy-trigger logs
tail -f ~/.autumn-capy/kafka/kafka.log
```

Re-run Startup to repair stopped containers and refresh env files:

```bash
bash scripts/setup/capy-startup.sh
```

To force a fresh local provisioning record, remove the state file and rerun
Startup. This does not delete the old Neon branch:

```bash
rm -f ~/.autumn-capy/state.json
bash scripts/setup/capy-startup.sh
```

Delete the old branch separately with `neonctl branches delete capy-<hash>` when
it is no longer needed.
