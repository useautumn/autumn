/** One place for every eval knob, like leaf's constants. Env overrides where
 * noted; everything else changes here, deliberately. */

export const BRAINTRUST_PROJECT = "ax-evals";

/** THE knob: type the agent you want eval cases to run on.
 *
 *   "codex"              Codex CLI, ChatGPT subscription ($0), its default model
 *   "codex:gpt-5.2"      Codex CLI, a specific Codex model
 *   "claude-haiku-4-5"   Claude Code on the Claude subscription ($0)
 *   "x-ai/grok-4.5"      Claude Code routed through OpenRouter (any "/" model id,
 *                        billed to OPENROUTER_API_KEY)
 *
 * Override per-run with AX_EVALS_AGENT. */
export const AGENT = process.env.AX_EVALS_AGENT ?? "codex:gpt-5.6-terra";

export const AGENT_HARNESS: "claude" | "codex" =
	AGENT === "codex" || AGENT.startsWith("codex:") ? "codex" : "claude";

export const AGENT_MODEL =
	AGENT_HARNESS === "codex" ? AGENT.replace(/^codex:?/, "") : AGENT;

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
 * AX_EVALS_AGENT   overrides the pinned AGENT for one run (see above)
 * AX_EVALS_ARM     comma-separated arms to run; unset = all (local run.sh sets with)
 * AX_EVALS_COMPACT "1" = one line per turn + failures-only scorecard, for
 *                  parallel multi-file runs (bun e sets it automatically) */
