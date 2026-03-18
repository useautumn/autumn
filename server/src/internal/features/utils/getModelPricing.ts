import { CacheManager } from "@/utils/cacheUtils/CacheManager";

const MODELS_DEV_CACHE_KEY = "models_dev_pricing";

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
