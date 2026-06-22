import {
	poolsFromParts,
	type TokenParts,
	type TokenPools,
} from "../shared/usage.js";

type NestedTokens = {
	total?: number | null;
	noCache?: number | null;
	cacheRead?: number | null;
	cacheWrite?: number | null;
	text?: number | null;
	reasoning?: number | null;
};

type LegacyCount = number | { total?: number | null } | null;

/** Lenient view over AI SDK usage shapes: nested V3 counts, flat counts with token details, and legacy prompt/completion counts. */
export type UsageLike = {
	inputTokens?: number | NestedTokens | null;
	outputTokens?: number | NestedTokens | null;
	promptTokens?: LegacyCount;
	completionTokens?: LegacyCount;
	inputTokenDetails?: {
		noCacheTokens?: number | null;
		cacheReadTokens?: number | null;
		cacheWriteTokens?: number | null;
	} | null;
	outputTokenDetails?: {
		textTokens?: number | null;
		reasoningTokens?: number | null;
	} | null;
	cachedInputTokens?: number | null;
	reasoningTokens?: number | null;
};

const flatCount = (value: LegacyCount | undefined): number | undefined =>
	typeof value === "number" ? value : (value?.total ?? undefined);

const isNested = (
	value: number | NestedTokens | null | undefined,
): value is NestedTokens => value != null && typeof value === "object";

const toParts = (usage: UsageLike): TokenParts => {
	const input = usage.inputTokens;
	const output = usage.outputTokens;

	if (isNested(input)) {
		const out = isNested(output) ? output : undefined;
		return {
			cacheRead: input.cacheRead ?? 0,
			cacheWrite: input.cacheWrite ?? 0,
			reasoning: out?.reasoning ?? 0,
			textInput: input.noCache,
			totalInput: input.total,
			textOutput: out?.text,
			totalOutput: out?.total,
		};
	}

	return {
		cacheRead:
			usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0,
		cacheWrite: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
		reasoning:
			usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0,
		textInput: usage.inputTokenDetails?.noCacheTokens,
		totalInput:
			typeof input === "number" ? input : flatCount(usage.promptTokens),
		textOutput: usage.outputTokenDetails?.textTokens,
		totalOutput:
			typeof output === "number" ? output : flatCount(usage.completionTokens),
	};
};

/** Splits provider usage into exclusive token pools; throws if the provider returned no usable counts. */
export const normalizeUsage = (
	usage: UsageLike,
	modelName: string,
): TokenPools => poolsFromParts(toParts(usage), modelName);
