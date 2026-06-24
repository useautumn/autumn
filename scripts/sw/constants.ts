import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Registry of sw-managed worktrees (mirrors dw's `~/.autumn-worktrees.json`). */
export const REGISTRY_DIR = join(homedir(), ".autumn-sw");
export const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");

/** Box-side provisioner copied to and run on the devbox. */
export const PROVISION_SH = join(SCRIPT_DIR, "remote/provision.sh");

/** exe.dev defaults. A custom baked image keeps spin-up fast (deps pre-installed). */
export const EXE_LOBBY = "exe.dev";
export const EXE_DEFAULTS = {
	image: process.env.SW_EXE_IMAGE ?? "ubuntu-24.04",
	cpu: process.env.SW_EXE_CPU ?? "4",
	memory: process.env.SW_EXE_MEMORY ?? "8192",
	disk: process.env.SW_EXE_DISK ?? "40",
} as const;

/** Subdir under the devbox's $HOME where worktree checkouts live. */
export const REMOTE_WORKTREES_SUBDIR = "autumn-worktrees";

export const tmuxServerSession = (slug: string): string => `${slug}-dev`;
