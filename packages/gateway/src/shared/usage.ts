/** Mutually exclusive token pools — each pool is priced at its own rate server-side. */
export type TokenPools = {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	audioInputTokens?: number;
	audioOutputTokens?: number;
};

export const clamp = (value: number) => Math.max(0, value);

export const requiredCount = (
	value: number | null | undefined,
	label: string,
	modelName: string,
): number => {
	if (value == null) {
		throw new Error(
			`[Autumn] ${label} token usage was not returned by the model provider (${modelName}). This provider may not support usage tracking.`,
		);
	}
	return value;
};
