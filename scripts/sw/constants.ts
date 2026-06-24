import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Target } from "./types.ts";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");

/** Root package.json name that gates autumn-specific worktree setup. */
export const AUTUMN_PACKAGE_NAME = "autumn";

/**
 * Marker file written into a remote worktree's LOCAL checkout. Its presence is
 * what the wrapper shell keys on to ssh into the devbox instead of a local shell,
 * so it must persist on disk (it survives herdr restarts → panes auto re-ssh).
 */
export const MARKER_FILE = ".herdr-remote";

/** Registry of sw-managed worktrees (mirrors dw's `~/.autumn-worktrees.json`). */
export const REGISTRY_DIR = join(homedir(), ".autumn-sw");
export const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");

/** The wrapper source in the repo (copied to STABLE_WRAPPER by `sw install`). */
export const WRAPPER_SH = join(SCRIPT_DIR, "shell/worktree-shell.sh");
/** Box-side provisioner copied to and run on the devbox. */
export const PROVISION_SH = join(SCRIPT_DIR, "remote/provision.sh");

const CONFIG_HOME = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
/**
 * Stable home for the installed wrapper, OUTSIDE any worktree. `default_shell`
 * points here so deleting the source worktree can never dangle herdr's global
 * shell (which would brick every pane). `sw install` (re-)copies the wrapper here.
 */
export const STABLE_DIR = join(CONFIG_HOME, "atmn-sw");
/** The whole `scripts/sw` tree is copied here by `sw install` so neither the
 * wrapper, the plugin, nor the CLI depends on a worktree that may be deleted or
 * branched off a commit that predates `scripts/sw`. */
export const STABLE_CLI_DIR = join(STABLE_DIR, "cli");
export const STABLE_WRAPPER = join(
	STABLE_CLI_DIR,
	"shell",
	"worktree-shell.sh",
);
export const STABLE_PLUGIN_DIR = join(STABLE_CLI_DIR, "plugin");

export const herdrConfigPath = (): string =>
	join(CONFIG_HOME, "herdr", "config.toml");

export const SUPPORTED_TARGETS: Target[] = ["local", "exe", "modal"];

/** exe.dev defaults. A custom baked image keeps spin-up fast (deps pre-installed). */
export const EXE_LOBBY = "exe.dev";
export const EXE_DOMAIN = "exe.xyz";
export const EXE_DEFAULTS = {
	image: process.env.SW_EXE_IMAGE ?? "ubuntu-24.04",
	cpu: process.env.SW_EXE_CPU ?? "4",
	memory: process.env.SW_EXE_MEMORY ?? "8192",
	disk: process.env.SW_EXE_DISK ?? "40",
} as const;

/** Subdir under the devbox's $HOME where worktree checkouts live (resolved to an
 * absolute path at provision time, since the marker's `path` must be absolute). */
export const REMOTE_WORKTREES_SUBDIR = "autumn-worktrees";

/** Tools the devbox image must carry (baked) or the provisioner installs. */
export const REMOTE_PREINSTALL = [
	"bun",
	"lazygit",
	"@sirtenzin/hunks",
] as const;

export const tmuxServerSession = (slug: string): string => `${slug}-dev`;

/** herdr's per-agent socket env the status hook needs, forwarded over ssh. */
export const HERDR_HOOK_ENV = [
	"HERDR_ENV",
	"HERDR_SOCKET_PATH",
	"HERDR_PANE_ID",
	"HERDR_TAB_ID",
	"HERDR_WORKSPACE_ID",
] as const;
