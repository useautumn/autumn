export const DEFAULT_CHAT_MODEL = "anthropic/claude-opus-4-8";

export const leafChatAgentDefaults = {
	maxSteps: 8,
	model: DEFAULT_CHAT_MODEL,
} as const;
