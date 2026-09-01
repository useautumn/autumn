/** One place for every eval knob, like leaf's constants. Env overrides where
 * noted; everything else changes here, deliberately. */

export const BRAINTRUST_PROJECT = "ax-evals";

/** Pinned so results are comparable across machines and sessions. Override
 * per-run with AX_EVALS_MODEL. */
export const AGENT_MODEL = process.env.AX_EVALS_MODEL ?? "claude-haiku-4-5";

export const AGENT_ALLOWED_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"Glob",
	"Grep",
	"Skill",
	// Without Bash every shell command stalls on an approval nobody can grant,
	// and runs degrade into permission negotiation. Workspaces are throwaway
	// temp dirs; step-tier cases stub atmn's network verbs.
	"Bash",
];

export const DEFAULT_MAX_TURNS = 10;
export const DEFAULT_TIMEOUT_MS = 240_000;
export const MAX_CONCURRENT_ARMS = 2;

/** Local Ctrl+Enter / `run.sh` sets `AX_EVALS_ARM=with` so you iterate the
 * skill without paying for the bare baseline. Unset (CI, `bun run evals`)
 * still runs every arm. Comma-separated, e.g. `with,without`. */
export const ARMS_TO_RUN = (process.env.AX_EVALS_ARM ?? "")
	.split(",")
	.map((arm) => arm.trim())
	.filter(Boolean);

export const PLUGIN_NAME = "autumn";

/** Env toggles (documented here, read where used):
 * AX_EVALS_TRACE   "live" = raw event stream, "0" = silent, default = blocks
 * AX_EVALS_KEEP    "1" keeps a case workspace on disk for debugging
 * AX_EVALS_USE_API_KEY  "1" bills the API key instead of subscription auth
 * AX_EVALS_MODEL   overrides the pinned agent model for one run
 * AX_EVALS_ARM     comma-separated arms to run; unset = all (local run.sh sets with) */
