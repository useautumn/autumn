# `sw` — Sandbox Worktrees (local + remote, via herdr)

Turns every new herdr worktree for the `@autumn` repo into a ready dev stack —
either **local** (`bun dw`) or on a **remote exe.dev devbox** with native services
— chosen from a picker that launches automatically. One herdr server on your Mac;
remote worktrees feel native because every pane auto-ssh's into its box.

## How it fits together

1. **herdr plugin** (`plugin/`) subscribes to `worktree.created`. When the new
   worktree is `@autumn`, it injects the picker into the worktree's first pane.
2. **Picker** (`bun scripts/sw/index.ts pick`) prompts **Local / exe.dev**.
   - **Local** → `bun dw setup`, then the dev server in a `‹slug›-dev` tmux session
     + a `claude` pane.
   - **exe.dev** → push branch, issue a Neon branch *from the Mac*, create the VM,
     provision native Dragonfly + goaws (no Docker), write a `.herdr-remote` marker,
     then hand this pane to the box's `bun dev`.
3. **Wrapper shell** (`shell/worktree-shell.sh`) is herdr's global `default_shell`.
   For a worktree carrying a `.herdr-remote` marker it `exec ssh`'s into the box
   (so **every** pane — including ones you open later — lands there); otherwise it
   execs your real shell. This is what makes manual panes "just work" remotely, and
   what makes remote worktrees self-heal across herdr restarts (the marker persists,
   so restored panes re-ssh; herdr re-injects `claude --resume`).

## Install (one time)

```sh
bun run sw:install
```

Sets `[terminal] default_shell` in `~/.config/herdr/config.toml` to the wrapper,
`herdr plugin link`s the plugin, and reloads herdr. Requires `ssh exe.dev`, `neon`,
and `infisical` authenticated on the Mac.

## Commands

| Command | What |
|---|---|
| `bun scripts/sw/index.ts pick` | picker (the plugin runs this; rarely by hand) |
| `bun run sw:list` | list sw-managed worktrees + their target/box |
| `bun run sw:teardown [path]` | delete the VM + Neon branch (remote) or `dw teardown` (local) |
| `bun run sw:install` | wire the wrapper + plugin into herdr |

`SW_TARGET=local|exe` skips the picker (non-interactive / scripted runs).

## Remote box layout

- **DB**: a Neon branch issued from the Mac (survives box rebuilds; no Neon auth on
  the box). **Cache/SQS**: native Dragonfly + goaws, the same engines as `bun tw`.
- **Secrets**: exported once from the Mac via `infisical export` and merged with the
  per-worktree DB/Redis/SQS overrides into `server/.env.local` on the box.
- **Agent status over ssh**: the wrapper reverse-forwards herdr's per-pane socket
  (`ssh -R`) and re-exports `HERDR_*`; the box runs the vendored herdr Claude hook
  (`remote/herdr-agent-state.sh`). The visual working/idle/blocked detector already
  works over ssh; this adds session identity + `claude --resume`. The provisioner
  sets `AllowStreamLocalForwarding`/`StreamLocalBindUnlink` on the box's sshd.
- **Sticky**: exe.dev VMs never auto-sleep; `tmux new -A` re-attaches the running
  server on reconnect. `bun run sw:teardown` reclaims the box + Neon branch.

## Notes

- **Modal** is intentionally not wired yet — exe.dev is the right fit for sticky dev
  boxes (persistent, SSH-native). The picker offers Local / exe.dev; a `modal`
  provider can slot into `commands/remote.ts` later.
- The git worktree itself is created/removed by herdr/git; `sw` never deletes it.
