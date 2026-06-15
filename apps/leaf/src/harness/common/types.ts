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
