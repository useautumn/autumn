# `bun sw` — Sandbox Worktrees (local + remote)

Run it in a fresh worktree's first pane. It asks **Local / exe.dev**, then drives
everything: provisions the stack and lays out the dev-server + claude panes for you.
Replaces the manual `bun dw setup` + tmux + `claude` dance.

## Flow

```
# you make a worktree in herdr → land in the first pane
bun sw            # pick Local or exe.dev
```

- **Local** → `bun dw setup` (Neon branch + goaws/Dragonfly), then the dev server
  in a `‹slug›-dev` tmux session + a `claude` pane. Done.
- **exe.dev** → push branch, issue a Neon branch *from the Mac*, create the VM,
  provision native Dragonfly + goaws (no Docker), then this pane hosts the box's
  `bun dev` over ssh and the claude pane ssh's into the box. Visual agent-status
  (working/idle/blocked) works over ssh out of the box.

`SW_TARGET=local|exe bun sw` skips the prompt (scripted runs).

## Commands

| Command | What |
|---|---|
| `bun sw` | pick Local / exe.dev and set the worktree up |
| `bun run sw:list` | list sw-managed worktrees + their target/box |
| `bun run sw:teardown [path]` | delete the VM + Neon branch (remote) or `dw teardown` (local) |

## Remote box (exe.dev)

- **DB**: a Neon branch issued from the Mac (survives box rebuilds; no Neon auth on
  the box). **Cache/SQS**: native Dragonfly + goaws, same engines as `bun tw`.
- **Secrets**: exported once from the Mac via `infisical export` and merged with the
  per-worktree DB/Redis/SQS overrides into the box's `.env.local`.
- **Sticky**: exe.dev VMs never auto-sleep; `tmux new -A` re-attaches the running
  server on reconnect. `bun run sw:teardown` reclaims the box + Neon branch.

## Notes

- Prereqs on the Mac: `ssh exe.dev`, `neon`, and `infisical` authenticated.
- **Modal** is intentionally not wired yet — exe.dev fits sticky dev boxes; a `modal`
  provider can slot into `commands/remote.ts` later.
- The git worktree itself is created/removed by herdr/git; `sw` never deletes it.
- No herdr plugin / `default_shell` hooks: `sw` is a plain CLI you invoke yourself.
