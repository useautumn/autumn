export const DEFAULT_EVAL_CHAT_MODEL = "anthropic/claude-sonnet-4-6";

// Cheap/fast model for the throwaway env classifier (sandbox vs live) — it doesn't
// need a frontier model.
export const DEFAULT_CHAT_ENV_MODEL = "anthropic/claude-haiku-4-5";
export const DEFAULT_CHAT_ORG_MODEL = "anthropic/claude-sonnet-4-6";

export const leafChatAgentDefaults = {
	maxSteps: 8,
	model: DEFAULT_EVAL_CHAT_MODEL,
} as const;

// Keep this file env-free: evals import it, and lib/env.ts requires secrets at parse time.

export const MESSAGE_TIMEOUT_MS = 180_000;
