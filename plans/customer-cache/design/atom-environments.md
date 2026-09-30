---
author: john + claude
feature: customer-cache
date: 2026-09-30
status: approved (John, 2026-09-30)
---

# An Atom is a token plus a folder

Atom has no idea of orgs, keys or tenants. The token on a request selects a folder; an unknown
token gets 401. It calls Autumn as little as possible.

```
 prod / staging   alien starts a container for one org:
                  one token hash (set at deploy), one folder
 bun dw · tw      the stack runs ONE Atom process, like herald;
                  it holds an Atom per org that deployed:
                    token A ─► .data/atom/<A>/
                    token B ─► .data/atom/<B>/

 create_atom      Autumn makes the token and keeps it (encrypted) on the org
   prod           alien deploys the container with the token's hash
   dev / tw       server tells the stack's Atom: POST /v1/atoms.put { id, token_hash }
                  (dev-only routes, on only with ATOM_DEV=true; loopback, no secret)
```

## Auth, decided (John, 2026-09-30)

- One API, one rule: every route past `/health` needs the Atom's token, sent as `x-atom-token`.
  `Authorization` stays the Autumn secret key, which Atom only uses when it forwards to Autumn.
- The same API is reachable at a private address (the customer's app, inside the VPC) and a public
  one (herald's pushes). Atom does not care which was used.
- Autumn keeps the token encrypted on the org's cache record; the Atom is given only its SHA-256
  hash (`ATOM_TOKEN_HASH`). The customer sets one Atom URL with the token in it.
- No rotation in the first version. Checking the org's own secret keys on Atom is a later option
  (it needs key hashes synced to Atom).

## The seam: who provides an org's Atom

```ts
type AtomDeployer = {
  start({ org, env, tokenHash }) → { deploymentGroupId, setupUrl }
  find({ deploymentGroupId }) → { id, status, endpointUrl } | null
  delete({ deploymentGroupId }) → void
}
ALIEN_API_KEY      → alien, hosted
ALIEN_MANAGER_URL  → alien dev (set by hand for the smoke test; needs Docker)
ATOM_URL           → the stack's Atom process (set by dev.ts and tw's boot.ts)
```

`create_atom` returns the endpoint and the token; `get_atom` never returns the token. A stack
Atom that no longer holds the org's folder reads as `awaiting_setup`, and `create_atom` puts it back.

`dev.ts` starts Atom beside herald (watch mode, a port per worktree) and stops launching
`alien dev` by default. tw's `boot.ts` starts it the same way.

## What a local Atom leaves on a machine

- One process per dev stack, started and stopped with the stack.
- One folder per deployed org + env: `<worktree>/.data/atom/<id>/` (gitignored), holding the
  token's hash and the SQLite files. `delete_atom`, `bun dw teardown` and `reset` remove it. A tw
  sandbox's copy dies with the sandbox.
- Nothing in the home directory or any shared location.

## When Atom calls Autumn

Only to forward a request it cannot answer, with the caller's own key (a customer it does not
hold, `send_event`, locks; later, resolving tracks). Never to check a key or to find out who it is.

## What is tested where

| test | runs in | covers |
|---|---|---|
| integration: `create_atom` → ready → track → check on Atom | every worktree, tw | the stack deployer, herald's push, Atom's store and check |
| alien smoke: build, container up, data survives a release | one machine with Docker, by hand | the stack file, the image, the volume |

## What we found about alien's local mode (spike, 2026-09-30)

- `alien dev` built `apps/atom`, ran it in Docker with a volume, answered checks, and kept the
  stored subject across `alien dev release`.
- A local Container is always Docker, and its name and volume come only from the resource id
  (`alien-atom`), so two deployments or two worktrees share one container. tw's Modal sandboxes
  have no Docker.
- The local port is random and changes on every release; the deployment reports it at
  `stackState.resources.atom.outputs.publicEndpoints.api.url`.
- Stopping `alien dev` leaves the container and volume; deleting the deployment with `cleanup`
  removes both.
- For Alon: prefix local names with the deployment's resource prefix, and keep the port across
  releases.

## Considered and not chosen

- **One Atom process per org locally.** Matches prod's shape, but the server would have to spawn,
  track and clean up processes, and they would not hot reload with the stack.
- **Telling orgs apart by their secret key.** Needs a call to Autumn per key, or key hashes synced
  to Atom.
- **alien inside tw.** Needs Docker.

## Open

1. How the customer's app reaches the private address in alien's setup, and how alien's hosted
   flow passes a per-org value (`ATOM_TOKEN_HASH`) to the container: for Alon.
2. Atom's public endpoint takes Autumn's pushes. The more isolated form is Atom connecting out to
   Autumn for its feed, which also lets it catch up after being down.
