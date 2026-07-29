export type SessionTurnUsage = {
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	inputTokens: number;
	outputTokens: number;
};

export type SuspendedToolCall = {
	args: Record<string, unknown>;
	toolCallId: string;
	toolName: string;
	/** Cost facts captured from the agent's preview call this turn, if any. */
	preview?: unknown;
};

/** Harness-agnostic outcome of one driven agent turn. */
export type SessionTurnOutcome = {
	errorMessage?: string;
	/** All confirmations the turn is waiting on. */
	suspendedQueue?: SuspendedToolCall[];
	textParts: string[];
	toolResults?: Array<{ id: string; name: string; output: unknown }>;
	usage: SessionTurnUsage;
};
