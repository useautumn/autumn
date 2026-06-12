import { poolsFromParts, type TokenPools } from "../shared/usage.js";

type PromptDetails = {
	cachedTokens?: number | null;
	cached_tokens?: number | null;
	cacheWriteTokens?: number | null;
	cache_write_tokens?: number | null;
	audioTokens?: number | null;
	audio_tokens?: number | null;
};

type CompletionDetails = {
	reasoningTokens?: number | null;
	reasoning_tokens?: number | null;
};

/**
 * Lenient view over OpenRouter usage across all its surfaces: chat
 * completions (prompt/completion naming) and the responses API
 * (input/output naming), in SDK camelCase or raw snake_case.
 */
export type OpenRouterUsageLike = {
	promptTokens?: number | null;
	prompt_tokens?: number | null;
	inputTokens?: number | null;
	input_tokens?: number | null;
	completionTokens?: number | null;
	completion_tokens?: number | null;
	outputTokens?: number | null;
	output_tokens?: number | null;
	promptTokensDetails?: PromptDetails | null;
	prompt_tokens_details?: PromptDetails | null;
	inputTokensDetails?: PromptDetails | null;
	input_tokens_details?: PromptDetails | null;
	completionTokensDetails?: CompletionDetails | null;
	completion_tokens_details?: CompletionDetails | null;
	outputTokensDetails?: CompletionDetails | null;
	output_tokens_details?: CompletionDetails | null;
	/** OpenRouter's own charge in USD credits, present when usage accounting is enabled. */
	cost?: number | null;
};

/** Splits OpenRouter usage into exclusive token pools; prompt/completion totals are inclusive, so detail pools are subtracted out. */
export const normalizeOpenRouterUsage = (
	usage: OpenRouterUsageLike,
	modelName: string,
): TokenPools => {
	const promptDetails =
		usage.promptTokensDetails ??
		usage.prompt_tokens_details ??
		usage.inputTokensDetails ??
		usage.input_tokens_details;
	const completionDetails =
		usage.completionTokensDetails ??
		usage.completion_tokens_details ??
		usage.outputTokensDetails ??
		usage.output_tokens_details;

	const promptTotal =
		usage.promptTokens ??
		usage.prompt_tokens ??
		usage.inputTokens ??
		usage.input_tokens;
	const completionTotal =
		usage.completionTokens ??
		usage.completion_tokens ??
		usage.outputTokens ??
		usage.output_tokens;

	return poolsFromParts(
		{
			totalInput: promptTotal,
			totalOutput: completionTotal,
			cacheRead: promptDetails?.cachedTokens ?? promptDetails?.cached_tokens ?? 0,
			cacheWrite:
				promptDetails?.cacheWriteTokens ??
				promptDetails?.cache_write_tokens ??
				0,
			reasoning:
				completionDetails?.reasoningTokens ??
				completionDetails?.reasoning_tokens ??
				0,
			audioInput: promptDetails?.audioTokens ?? promptDetails?.audio_tokens ?? 0,
		},
		modelName,
	);
};
