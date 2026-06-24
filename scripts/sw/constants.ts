import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Registry of sw-managed worktrees (mirrors dw's `~/.autumn-worktrees.json`). */
export const REGISTRY_DIR = join(homedir(), ".autumn-sw");
export const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");

/** Box-side provisioner copied to and run on the devbox. */
export const PROVISION_SH = join(SCRIPT_DIR, "remote/provision.sh");

/**
 * Marker written into a remote worktree's LOCAL checkout. The wrapper shell keys
 * on its presence to ssh into the box (so every pane auto-routes); it persists on
 * disk, so panes restored after a herdr restart re-ssh automatically.
 */
export const MARKER_FILE = ".herdr-remote";
/** Wrapper source (copied to STABLE_WRAPPER by `sw install`). */
export const WRAPPER_SH = join(SCRIPT_DIR, "shell/worktree-shell.sh");

const CONFIG_HOME = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
/** Stable home for the installed wrapper, OUTSIDE any worktree, so deleting the
 * source worktree can never dangle herdr's global default_shell. */
export const STABLE_DIR = join(CONFIG_HOME, "atmn-sw");
export const STABLE_WRAPPER = join(STABLE_DIR, "worktree-shell.sh");
export const herdrConfigPath = (): string =>
	join(CONFIG_HOME, "herdr", "config.toml");

/** exe.dev defaults. A custom baked image keeps spin-up fast (deps pre-installed). */
export const EXE_LOBBY = "exe.dev";
// exe.dev `--memory`/`--disk` take unit suffixes (e.g. `8GB`), NOT megabytes;
// cpu caps at 2 and memory at 8 GB on the default plan.
export const EXE_DEFAULTS = {
	cpu: process.env.SW_EXE_CPU ?? "2",
	memory: process.env.SW_EXE_MEMORY ?? "8GB",
	disk: process.env.SW_EXE_DISK ?? "40GB",
} as const;

/**
 * Leave unset to use exe.dev's default `exeuntu` image — ~2s boot, with claude +
 * codex pre-installed. Only override (`SW_EXE_IMAGE`) for a custom baked image.
 */
export const EXE_IMAGE = process.env.SW_EXE_IMAGE;

/**
 * exe.dev GitHub integrations (per-repo) attached at VM-create, so the box clones
 * autumn + the private `ai` submodule via `https://<name>.int.exe.xyz/…` with no
 * creds on the box. Create them once: `ssh exe.dev integrations add github
 * --name=<name> --repository=<owner/repo>`.
 */
export const EXE_INTEGRATIONS = {
	autumn: process.env.SW_EXE_INT_AUTUMN ?? "useautumn-autumn",
	ai: process.env.SW_EXE_INT_AI ?? "useautumn-ai",
} as const;

/** Subdir under the devbox's $HOME where worktree checkouts live. */
export const REMOTE_WORKTREES_SUBDIR = "autumn-worktrees";

export const tmuxServerSession = (slug: string): string => `${slug}-dev`;
