/** Separator between the provider key and the model key in an AI credit `model_id`. */
export const PROVIDER_SEPARATOR = "/";

/** Prefix marking a user-defined model whose price comes from `model_markups`. */
export const CUSTOM_PROVIDER = "custom";

/**
 * Split a `model_id` on the first {@link PROVIDER_SEPARATOR}. The model key keeps any
 * remaining separators (e.g. openrouter slugs like `openrouter/openai/gpt-4o`). When no
 * separator is present the id is a bare model name and `provider` is `undefined`.
 */
export const splitModelId = (
	id: string,
): { provider: string | undefined; modelKey: string } => {
	const index = id.indexOf(PROVIDER_SEPARATOR);
	if (index === -1) {
		return { provider: undefined, modelKey: id };
	}
	return {
		provider: id.slice(0, index),
		modelKey: id.slice(index + PROVIDER_SEPARATOR.length),
	};
};

/** Build a canonical `model_id` from a provider key and model key. */
export const joinModelId = (provider: string, modelKey: string): string =>
	`${provider}${PROVIDER_SEPARATOR}${modelKey}`;

/** Whether a `model_id` refers to a custom, user-priced model. */
export const isCustomModel = (id: string): boolean =>
	id.startsWith(`${CUSTOM_PROVIDER}${PROVIDER_SEPARATOR}`);

/** A context-based price tier (e.g. higher rates once the prompt exceeds `size` tokens). */
export interface ModelsDevCostTier {
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
	tier: { type: string; size: number };
}

/** Per-token rates ($/M tokens) for a model. Only `input`/`output` are guaranteed. */
export interface ModelsDevCost {
	input: number;
	output: number;
	cache_read?: number;
	cache_write?: number;
	input_audio?: number;
	output_audio?: number;
	reasoning?: number;
	tiers?: ModelsDevCostTier[];
	context_over_200k?: {
		input: number;
		output: number;
		cache_read?: number;
		cache_write?: number;
	};
}

/** Shape of a single model from the models.dev API */
export interface ModelsDevModel {
	id: string;
	name: string;
	release_date?: string;
	cost: ModelsDevCost;
}

/** Shape of a provider from the models.dev API */
export interface ModelsDevProvider {
	id: string;
	name: string;
	models: Record<string, ModelsDevModel>;
}
