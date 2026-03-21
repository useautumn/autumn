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
	if (cached) return cached;

	try {
		const response = await fetch("https://models.dev/api.json");
		if (!response.ok) throw new Error(`models.dev returned ${response.status}`);

		const data: Record<string, ModelsDevProvider> = await response.json();
		await Promise.all([
			CacheManager.setJson(MODELS_DEV_CACHE_KEY, data, 60 * 60 * 3),
			CacheManager.setJson(
				`${MODELS_DEV_CACHE_KEY}_stale`,
				data,
				60 * 60 * 24 * 3,
			),
		]);
		return data;
	} catch {
		const stale = await CacheManager.getJson<Record<string, ModelsDevProvider>>(
			`${MODELS_DEV_CACHE_KEY}_stale`,
		);
		if (stale) return stale;
		throw new Error(
			"Failed to fetch models.dev pricing and no cache available",
		);
	}
};
