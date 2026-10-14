import { ms } from "@autumn/shared";

export const DEFAULT_EVAL_CHAT_MODEL = "anthropic/claude-sonnet-4-6";

export const DEFAULT_CHAT_ENV_MODEL = "anthropic/claude-haiku-4-5";
export const DEFAULT_CHAT_ORG_MODEL = "anthropic/claude-sonnet-4-6";

export const leafChatAgentDefaults = {
	maxSteps: 8,
	model: DEFAULT_EVAL_CHAT_MODEL,
} as const;

export const MESSAGE_TIMEOUT_MS = ms.minutes(3);
