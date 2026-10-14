export const BRAINTRUST_PROJECT = "ax-evals";

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
	"Bash",
];

export const DEFAULT_MAX_TURNS = 10;
export const DEFAULT_TIMEOUT_MS = 240_000;
export const MAX_CONCURRENT_ARMS = 2;

export const ARMS_TO_RUN = (process.env.AX_EVALS_ARM ?? "")
	.split(",")
	.map((arm) => arm.trim())
	.filter(Boolean);

export const PLUGIN_NAME = "autumn";
