import {
	ErrCode,
	type Feature,
	isCustomModel,
	type ModelsDevCost,
	type ModelsDevCostTier,
	type ModelsDevModel,
	type ModelsDevProvider,
	RecaseError,
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
): { effective: ModelsDevCost; tierApplied: boolean } => {
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
				effective: {
					...cost,
					input: chosen.input,
					output: chosen.output,
					cache_read: chosen.cache_read ?? cost.cache_read,
					cache_write: chosen.cache_write ?? cost.cache_write,
				},
				tierApplied: true,
			};
		}
		return { effective: cost, tierApplied: false };
	}
	if (cost.context_over_200k && totalInputTokens > LARGE_CONTEXT_THRESHOLD) {
		return {
			effective: {
				...cost,
				input: cost.context_over_200k.input,
				output: cost.context_over_200k.output,
				cache_read: cost.context_over_200k.cache_read ?? cost.cache_read,
				cache_write: cost.context_over_200k.cache_write ?? cost.cache_write,
			},
			tierApplied: true,
		};
	}
	return { effective: cost, tierApplied: false };
};

/** Effective per-token rates ($/M) used for a charge, after tier overlays and fallbacks. */
export type ModelCostRates = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	audioInput: number;
	audioOutput: number;
	reasoning: number;
};

export type ModelCostBreakdown = {
	cost: number;
	baseCost: number;
	markup: number;
	markupSource: "model" | "provider" | "default" | "none";
	tierApplied: boolean;
	rates: ModelCostRates;
};

const computeCost = ({
	cost,
	tokens,
	markup,
}: {
	cost: ModelsDevCost;
	tokens: TokenInput;
	markup: number;
}): { cost: number; baseCost: number; tierApplied: boolean; rates: ModelCostRates } => {
	const cacheRead = tokens.cacheRead ?? 0;
	const cacheWrite = tokens.cacheWrite ?? 0;
	const audioInput = tokens.audioInput ?? 0;
	const audioOutput = tokens.audioOutput ?? 0;
	const reasoning = tokens.reasoning ?? 0;

	const totalInput = tokens.input + cacheRead + cacheWrite;
	const { effective, tierApplied } = getEffectiveCost(cost, totalInput);

	// Pools without a published rate fall back to the base text rate.
	const rates: ModelCostRates = {
		input: effective.input,
		output: effective.output,
		cacheRead: effective.cache_read ?? effective.input,
		cacheWrite: effective.cache_write ?? effective.input,
		audioInput: effective.input_audio ?? effective.input,
		audioOutput: effective.output_audio ?? effective.output,
		reasoning: effective.reasoning ?? effective.output,
	};

	const baseCost = new Decimal(rates.input)
		.mul(tokens.input)
		.add(new Decimal(rates.output).mul(tokens.output))
		.add(new Decimal(rates.cacheRead).mul(cacheRead))
		.add(new Decimal(rates.cacheWrite).mul(cacheWrite))
		.add(new Decimal(rates.audioInput).mul(audioInput))
		.add(new Decimal(rates.audioOutput).mul(audioOutput))
		.add(new Decimal(rates.reasoning).mul(reasoning))
		.div(1_000_000);

	return {
		cost: baseCost
			.mul(new Decimal(1).add(new Decimal(markup).div(100)))
			.toNumber(),
		baseCost: baseCost.toNumber(),
		tierApplied,
		rates,
	};
};

const resolveAiMarkup = ({
	modelName,
	creditSystem,
	modelMarkup,
}: {
	modelName: string;
	creditSystem: Feature;
	modelMarkup?: { markup?: number | null } | null;
}): { markup: number; source: ModelCostBreakdown["markupSource"] } => {
	if (modelMarkup?.markup != null) {
		return { markup: modelMarkup.markup, source: "model" };
	}

	const { provider } = splitModelId(modelName);
	const providerMarkup = provider
		? creditSystem.config?.provider_markups?.[provider]?.markup
		: undefined;
	if (providerMarkup != null) {
		return { markup: providerMarkup, source: "provider" };
	}

	const defaultMarkup = creditSystem.config?.default_markup;
	if (defaultMarkup != null) {
		return { markup: defaultMarkup, source: "default" };
	}

	return { markup: 0, source: "none" };
};

export const getModelCreditCostBreakdown = async ({
	modelName,
	creditSystem,
	...tokens
}: {
	modelName: string;
	creditSystem: Feature;
} & TokenInput): Promise<ModelCostBreakdown> => {
	const markups = creditSystem.model_markups || {};
	const pricingData = await getModelsDevPricing();
	const resolved = resolveModel({ modelName, pricingData });

	const markupEntry = markups[modelName];
	const { markup, source } = resolveAiMarkup({
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
		const computed = computeCost({
			cost: { input: markupEntry.input_cost, output: markupEntry.output_cost },
			tokens: { input: tokens.input, output: tokens.output },
			markup,
		});
		return { ...computed, markup, markupSource: source };
	}

	const computed = computeCost({
		cost: resolved.model.cost,
		tokens,
		markup,
	});
	return { ...computed, markup, markupSource: source };
};

export const getModelCreditCost = async (
	args: { modelName: string; creditSystem: Feature } & TokenInput,
): Promise<number> => (await getModelCreditCostBreakdown(args)).cost;
