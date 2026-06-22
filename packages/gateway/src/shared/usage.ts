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

/**
 * Provider-agnostic intermediate: inclusive totals plus whichever detail
 * pools the provider reports. Adapters map their wire shapes onto this;
 * poolsFromParts subtracts the details out so pools end up exclusive.
 */
export type TokenParts = {
	/** Inclusive input total (cache and audio counted in). */
	totalInput?: number | null;
	/** Exclusive text input — wins over totalInput when reported directly. */
	textInput?: number | null;
	/** Inclusive output total (reasoning counted in). */
	totalOutput?: number | null;
	/** Exclusive text output — wins over totalOutput when reported directly. */
	textOutput?: number | null;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
	/** Set (even to 0) only when the provider has an audio input pool. */
	audioInput?: number;
};

/** Splits provider usage into exclusive token pools; throws if the provider returned no usable counts. */
export const poolsFromParts = (
	parts: TokenParts,
	modelName: string,
): TokenPools => {
	const cacheRead = parts.cacheRead ?? 0;
	const cacheWrite = parts.cacheWrite ?? 0;
	const reasoning = parts.reasoning ?? 0;
	const audioInput = parts.audioInput ?? 0;

	const textInput =
		parts.textInput ??
		(parts.totalInput != null
			? parts.totalInput - cacheRead - cacheWrite - audioInput
			: undefined);
	const textOutput =
		parts.textOutput ??
		(parts.totalOutput != null ? parts.totalOutput - reasoning : undefined);

	return {
		inputTokens: clamp(requiredCount(textInput, "Input", modelName)),
		outputTokens: clamp(requiredCount(textOutput, "Output", modelName)),
		cacheReadTokens: clamp(cacheRead),
		cacheWriteTokens: clamp(cacheWrite),
		reasoningTokens: clamp(reasoning),
		...(parts.audioInput !== undefined && {
			audioInputTokens: clamp(audioInput),
		}),
	};
};
