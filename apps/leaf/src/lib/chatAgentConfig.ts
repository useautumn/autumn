export const DEFAULT_CHAT_MODEL = "anthropic/claude-opus-4-8";

// Cheap/fast model for the throwaway env classifier (sandbox vs live) — it doesn't
// need a frontier model.
export const DEFAULT_CHAT_ENV_MODEL = "anthropic/claude-haiku-4-5";

export const leafChatAgentDefaults = {
	maxSteps: 8,
	model: DEFAULT_CHAT_MODEL,
} as const;

// Keep this file env-free: evals import it, and lib/env.ts requires secrets at parse time.

/** "mastra" = the Mastra leaf agent loop; "claude-managed" = the Claude Managed Agents engine. */
export type AgentHarnessName = "claude-managed" | "mastra";

/** Which loop the production Slack bot runs messages through; AGENT_HARNESS env overrides. */
export const DEFAULT_AGENT_HARNESS: AgentHarnessName = "claude-managed";

/**
 * Which harness evals run through when the eval file passes no driver; EVAL_DRIVER env overrides.
 * Per-harness suites pass their driver explicitly (e.g. tests/evals/claudeManaged/).
 */
export const DEFAULT_EVAL_DRIVER: AgentHarnessName = "claude-managed";

/** End-to-end per-message timeout; the in-process Agent SDK loop spawns a subprocess, so more headroom. */
export const messageTimeoutMs: Record<AgentHarnessName, number> = {
	"claude-managed": 120_000,
	mastra: 60_000,
};
