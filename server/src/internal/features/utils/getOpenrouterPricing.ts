import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const OPENROUTER_CACHE_KEY = "openrouter_pricing";

export interface OpenRouterModel {
	id: string;
	canonical_slug: string;
	hugging_face_id?: string;
	name: string;
	created: number;
	description: string;
	context_length: number;
	architecture: Architecture;
	pricing: Pricing;
	top_provider: TopProvider;
	supported_parameters: string[];
	default_parameters?: DefaultParameters;
	expiration_date?: string;
}

export interface Architecture {
	modality: string;
	input_modalities: string[];
	output_modalities: string[];
	tokenizer: string;
	instruct_type?: string;
}

export interface Pricing {
	prompt: string;
	completion: string;
	web_search?: string;
	input_cache_read?: string;
	image?: string;
	audio?: string;
	internal_reasoning?: string;
	input_cache_write?: string;
	request?: string;
}

export interface TopProvider {
	context_length?: number;
	max_completion_tokens?: number;
	is_moderated: boolean;
}

export interface DefaultParameters {
	temperature?: number;
	top_p?: number;
	top_k?: number;
	repetition_penalty?: number;
}
export const normaliseAiModelName = (modelName: string): string => {
	return modelName
		.toLowerCase()
		.replace(/\./g, "-") // claude-opus-4.6 → claude-opus-4-6
		.replace(/-\d{8}$/, "") // strip trailing dates like -20251001
		.replace(/^[^/]+\//, ""); // strip provider prefix: meta-llama/llama → llama
};

export const getOpenrouterPricing = async () => {
	const [cached, redundantCached] = [
		await CacheManager.getJson<OpenRouterModel[]>(OPENROUTER_CACHE_KEY),
		await CacheManager.getJson<OpenRouterModel[]>(
			`${OPENROUTER_CACHE_KEY}_redundant`,
		),
	];
	if (cached) {
		return cached;
	}
	const response = await fetch("https://openrouter.ai/api/v1/models");
	const { data: models }: { data: OpenRouterModel[] } = await response.json();
	if (!response.ok && redundantCached) {
		// If the request failed but we have a redundant cache, use it
		return redundantCached;
	} else if (!response.ok) {
		// If the request failed and we don't have a redundant cache, throw an error
		throw new Error(
			"Failed to fetch OpenRouter pricing and no cache available",
		);
	}

	await Promise.all([
		CacheManager.setJson(OPENROUTER_CACHE_KEY, models, 60 * 60 * 3), // Cache for 3 hours
		CacheManager.setJson(
			`${OPENROUTER_CACHE_KEY}_redundant`,
			redundantCached || models,
			60 * 60 * 72,
		), // Cache redundant copy for 3 days
	]);
	return models;
};
