import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const OPENROUTER_CACHE_KEY = "openrouter_pricing";
const MODELS_DEV_CACHE_KEY = "models_dev_pricing";

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
	if (!response.ok) {
		if (redundantCached) return redundantCached;
		throw new Error(
			"Failed to fetch OpenRouter pricing and no cache available",
		);
	}

	const { data: models }: { data: OpenRouterModel[] } = await response.json();
	await Promise.all([
		CacheManager.setJson(OPENROUTER_CACHE_KEY, models, 60 * 60 * 3), // Cache for 3 hours
		CacheManager.setJson(
			`${OPENROUTER_CACHE_KEY}_redundant`,
			models,
			60 * 60 * 72,
		), // Cache redundant copy for 3 days
	]);
	return models;
};

interface ModelsDevModel {
	id: string;
	name: string;
	cost: {
		input: number;
		output: number;
	}
}

interface ModelsDevProvider {
	id: string;
	name: string;
	models: Record<string, ModelsDevModel>;
}

export const getModelsDevPricing = async () => {
	const cached =
		await CacheManager.getJson<Record<string, ModelsDevProvider>>(
			MODELS_DEV_CACHE_KEY,
		);
	if (cached) {
		return cached;
	}

	const redundantCached = await CacheManager.getJson<Record<string, ModelsDevProvider>>(
		`${MODELS_DEV_CACHE_KEY}_redundant`,
	);

	try {
		const response = await fetch("https://models.dev/api.json");
		if (!response.ok) return redundantCached;

		const data: Record<string, ModelsDevProvider> = await response.json();
		await Promise.all([
			CacheManager.setJson(MODELS_DEV_CACHE_KEY, data, 60 * 60 * 3), // Cache for 3 hours
			CacheManager.setJson(
				`${MODELS_DEV_CACHE_KEY}_redundant`,
				data,
				60 * 60 * 72,
			), // Cache redundant copy for 3 days
		]);
		return data;
	} catch {
		if (redundantCached) return redundantCached;
		throw new Error(
			"Failed to fetch models.dev pricing and no cache available",
		);
	}
};
