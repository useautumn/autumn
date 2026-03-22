import { CacheManager } from "@/utils/cacheUtils/CacheManager";
import { ErrCode, InternalError, type ModelsDevProvider } from "@autumn/shared";

const MODELS_DEV_CACHE_KEY = "models_dev_pricing";

export const getModelsDevPricing = async () => {
	try {
		const cached =
			await CacheManager.getJson<Record<string, ModelsDevProvider>>(
				MODELS_DEV_CACHE_KEY,
			);
		if (cached) return cached;
		const response = await fetch("https://models.dev/api.json");
		if (!response.ok)
			throw new InternalError({
				message: `models.dev returned ${response.status}`,
				code: ErrCode.InternalError,
			});

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
		throw new InternalError({
			message: "Failed to fetch models.dev pricing and no cache available",
			code: ErrCode.InternalError,
		});
	}
};
