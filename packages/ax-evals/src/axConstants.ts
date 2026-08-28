/** One place for every eval knob, like leaf's constants. Env overrides where
 * noted; everything else changes here, deliberately. */

export const BRAINTRUST_PROJECT = "ax-evals";

/** Pinned so results are comparable across machines and sessions. Override
 * per-run with AX_EVALS_MODEL. */
export const AGENT_MODEL = process.env.AX_EVALS_MODEL ?? "claude-sonnet-5";

export const AGENT_ALLOWED_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"Glob",
	"Grep",
	"Skill",
];

export const DEFAULT_MAX_TURNS = 10;
export const DEFAULT_TIMEOUT_MS = 240_000;
export const MAX_CONCURRENT_ARMS = 2;

export const PLUGIN_NAME = "autumn";

/** Env toggles (documented here, read where used):
 * AX_EVALS_TRACE   "live" = raw event stream, "0" = silent, default = blocks
 * AX_EVALS_KEEP    "1" keeps a case workspace on disk for debugging
 * AX_EVALS_USE_API_KEY  "1" bills the API key instead of subscription auth
 * AX_EVALS_MODEL   overrides the pinned agent model for one run */
