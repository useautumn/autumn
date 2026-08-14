# Capy v2 development environment

Autumn runs end-to-end in Capy v2 VMs using project-level **Setup**. Capy owns
the VM lifecycle, Docker provides local infrastructure, and Neon provides an
isolated database branch for each VM.

## Setup lifecycle

Configure this repository under **Settings → Project → Dev environment**:

| Lifecycle | Command | Responsibility |
| --- | --- | --- |
| Initialize | `bash scripts/setup/capy-init.sh` | installs workspace dependencies and `neonctl`, then pulls the Dragonfly, ElasticMQ, and DynamoDB Local images for snapshot reuse |
| Update after checkout | `bun install --frozen-lockfile` | reconciles dependencies when a reused or snapshotted VM checks out another commit |
| Startup | `bash scripts/setup/capy-startup.sh` | idempotently starts local infrastructure, provisions or resumes the VM's Neon branch, applies pending migrations and SQL functions, and writes local env files |

Initialize does not start services or create per-VM state, so it is safe to run
during a snapshot build. Startup is blocking but bounded: its containers detach,
its readiness checks finish, and the script exits as required by Capy v2.

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
`SLACK_BOT_TOKEN` pass through when configured.

## Runtime services

Startup launches the existing `scripts/setup/dw.compose.yml` services under the
Compose project `autumn-capy`:

| Port | Service |
| --- | --- |
| 6379 | Dragonfly |
| 8000 | DynamoDB Local |
| 9324 | ElasticMQ |

The application remains opt-in. Run the Setup command `dev` or `bun dev` when a
task needs the full stack:

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

## Provisioning model

`scripts/capy/provision.ts` reads the VM's `bindingId` from the file referenced
by `CAPY_MACHINE_CONFIG`, hashes it into a `capy-<hash>` Neon branch name, and
stores non-secret branch metadata plus generated local auth secrets in
the mode-`0600` file `~/.autumn-capy/state.json`. A resumed VM reuses that
branch and refreshes its connection string. A new VM gets a new branch.

The script writes managed values into:

- `server/.env.local`
- `vite/.env.local`
- `apps/checkout/.env.local`

The Bun preload in `scripts/preload-env.ts` loads those files for direct commands,
so Capy does not need Infisical for the local stack.

## Troubleshooting

Inspect local infrastructure with:

```bash
docker compose -f scripts/setup/dw.compose.yml -p autumn-capy ps
docker compose -f scripts/setup/dw.compose.yml -p autumn-capy logs
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
