import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
export const SHARED_DIR = join(PROJECT_ROOT, "shared");

export const REGISTRY_PATH = join(homedir(), ".autumn-worktrees.json");
export const MAX_WORKTREE = 50;
// Allowlist for branches the helpers in this directory are willing to
// create/delete. dw worktree branches use `dw-wt-<N>-<hash>`; capy sandbox
// branches use `capy-<hash>` (scripts/capy/provision.ts). Anything else is
// rejected to avoid clobbering production / staff branches.
export const BRANCH_NAME_RE = /^(?:dw-wt-\d+|capy)-[a-f0-9]+$/;
export const INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;

export const NEON_PROJECT_ID = "weathered-morning-43833874";
export const NEON_TEMPLATE_BRANCH = "dw-template";
export const NEON_PARENT_BRANCH = "production";

export const EMULATE_PID_FILE = join(homedir(), ".autumn-emulate.pid");
export const START_EMULATE_SH = join(SCRIPT_DIR, "../setup/start-emulate.sh");

export const ENV_LOCAL_TARGETS = [
	"server/.env.local",
	"vite/.env.local",
	"apps/checkout/.env.local",
] as const;

export const ENV_LOCAL_DISABLED_SUFFIX = ".disabled";
