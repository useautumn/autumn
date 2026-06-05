import {
	ErrCode,
	type Feature,
	isCustomModel,
	type ModelsDevCost,
	type ModelsDevCostTier,
	type ModelsDevModel,
	type ModelsDevProvider,
	RecaseError,
	resolveInheritedMarkup,
	splitModelId,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getModelsDevPricing } from "@/internal/features/utils/getModelPricing.js";

export type TokenInput = {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
	audioInput?: number;
	audioOutput?: number;
	reasoning?: number;
};

type ModelPricingData = Record<string, ModelsDevProvider>;

const LARGE_CONTEXT_THRESHOLD = 200_000;

type ResolvedModel =
	| { custom: true }
	| {
			custom: false;
			providerKey: string;
			modelKey: string;
			model: ModelsDevModel;
	  };

const modelNotFoundError = (modelName: string) =>
	new RecaseError({
		message: `Model ${modelName} not found in models.dev pricing data`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: { modelName },
	});

/**
 * Resolve a `model_id` to a models.dev entry by exact `<provider>/<model>` lookup. The id is
 * split on the first `/` (so openrouter slugs like `openrouter/openai/gpt-4o` keep their inner
 * `/`); the model key must match a models.dev entry exactly. `custom/` models skip resolution.
 */
const resolveModel = ({
	modelName,
	pricingData,
}: {
	modelName: string;
	pricingData: ModelPricingData;
}): ResolvedModel => {
	if (isCustomModel(modelName)) {
		return { custom: true };
	}

	const { provider, modelKey } = splitModelId(modelName);
	const model = provider ? pricingData[provider]?.models[modelKey] : undefined;
	if (!(provider && model)) {
		throw modelNotFoundError(modelName);
	}

	return { custom: false, providerKey: provider, modelKey, model };
};

/**
 * Resolve the effective per-token rates for a request, overlaying the active long-context
 * tier (or `context_over_200k`) onto the base rates. Tier-level `cache_read`/`cache_write`
 * override the base cache rates when present, so cache tokens above the threshold are billed
 * at the tier rate too — not just input/output.
 */
const getEffectiveCost = (
	cost: ModelsDevCost,
	totalInputTokens: number,
): ModelsDevCost => {
	if (cost.tiers?.length) {
		let chosen: ModelsDevCostTier | undefined;
		for (const tier of cost.tiers) {
			if (
				totalInputTokens > tier.tier.size &&
				(!chosen || tier.tier.size > chosen.tier.size)
			) {
				chosen = tier;
			}
		}
		if (chosen) {
			return {
				...cost,
				input: chosen.input,
				output: chosen.output,
				cache_read: chosen.cache_read ?? cost.cache_read,
				cache_write: chosen.cache_write ?? cost.cache_write,
			};
		}
		return cost;
	}
	if (cost.context_over_200k && totalInputTokens > LARGE_CONTEXT_THRESHOLD) {
		return {
			...cost,
			input: cost.context_over_200k.input,
			output: cost.context_over_200k.output,
			cache_read: cost.context_over_200k.cache_read ?? cost.cache_read,
			cache_write: cost.context_over_200k.cache_write ?? cost.cache_write,
		};
	}
	return cost;
};

const computeCost = ({
	cost,
	tokens,
	markup,
}: {
	cost: ModelsDevCost;
	tokens: TokenInput;
	markup: number;
}): number => {
	const cacheRead = tokens.cacheRead ?? 0;
	const cacheWrite = tokens.cacheWrite ?? 0;
	const audioInput = tokens.audioInput ?? 0;
	const audioOutput = tokens.audioOutput ?? 0;
	const reasoning = tokens.reasoning ?? 0;

	const totalInput = tokens.input + cacheRead + cacheWrite;
	const effective = getEffectiveCost(cost, totalInput);
	const inputRate = effective.input;
	const outputRate = effective.output;

	// Pools without a published rate fall back to the base text rate.
	const cacheReadRate = effective.cache_read ?? inputRate;
	const cacheWriteRate = effective.cache_write ?? inputRate;
	const audioInputRate = effective.input_audio ?? inputRate;
	const audioOutputRate = effective.output_audio ?? outputRate;
	const reasoningRate = effective.reasoning ?? outputRate;

	return new Decimal(inputRate)
		.mul(tokens.input)
		.add(new Decimal(outputRate).mul(tokens.output))
		.add(new Decimal(cacheReadRate).mul(cacheRead))
		.add(new Decimal(cacheWriteRate).mul(cacheWrite))
		.add(new Decimal(audioInputRate).mul(audioInput))
		.add(new Decimal(audioOutputRate).mul(audioOutput))
		.add(new Decimal(reasoningRate).mul(reasoning))
		.div(1_000_000)
		.mul(new Decimal(1).add(new Decimal(markup).div(100)))
		.toNumber();
};

const resolveAiMarkup = ({
	modelName,
	creditSystem,
	modelMarkup,
}: {
	modelName: string;
	creditSystem: Feature;
	modelMarkup?: { markup?: number | null } | null;
}) => {
	if (modelMarkup?.markup != null) {
		return modelMarkup.markup;
	}

	const { provider } = splitModelId(modelName);
	const providerMarkup = provider
		? creditSystem.config?.provider_markups?.[provider]?.markup
		: undefined;

	return (
		resolveInheritedMarkup({
			providerMarkup,
			defaultMarkup: creditSystem.config?.default_markup,
		}) ?? 0
	);
};

export const getModelCreditCost = async ({
	modelName,
	creditSystem,
	...tokens
}: {
	modelName: string;
	creditSystem: Feature;
} & TokenInput): Promise<number> => {
	const markups = creditSystem.model_markups || {};
	const pricingData = await getModelsDevPricing();
	const resolved = resolveModel({ modelName, pricingData });

	const markupEntry = markups[modelName];
	const markup = resolveAiMarkup({
		modelName,
		creditSystem,
		modelMarkup: markupEntry,
	});

	// Custom models carry no models.dev rates; they bill input/output at the user-supplied
	// costs only (cache/audio/reasoning pools are not priced for custom models).
	if (resolved.custom) {
		if (markupEntry?.input_cost == null || markupEntry?.output_cost == null) {
			throw new RecaseError({
				message: `Custom model ${modelName} is missing input_cost or output_cost in model_markups`,
				code: ErrCode.InvalidRequest,
				data: { modelName },
			});
		}
		return computeCost({
			cost: { input: markupEntry.input_cost, output: markupEntry.output_cost },
			tokens: { input: tokens.input, output: tokens.output },
			markup,
		});
	}

	return computeCost({
		cost: resolved.model.cost,
		tokens,
		markup,
	});
};
