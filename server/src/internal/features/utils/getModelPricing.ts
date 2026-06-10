import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import { ErrCode, InternalError, type ModelsDevProvider } from "@autumn/shared";

type ModelPricingData = Record<string, ModelsDevProvider>;

const CACHE_KEY = "models_dev_pricing";
const STALE_KEY = `${CACHE_KEY}_stale`;
const TTL_PRIMARY = 60 * 60 * 3;
const TTL_STALE = 60 * 60 * 24 * 3;
// Runs inside the track request path — a hanging models.dev must not hang tracks.
const FETCH_TIMEOUT_MS = 5000;

const fetchFromSource = async (): Promise<ModelPricingData> => {
	const response = await fetch("https://models.dev/api.json", {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new InternalError({
			message: `models.dev returned ${response.status}`,
			code: ErrCode.InternalError,
		});
	}
	return response.json();
};

export const getModelsDevPricing = async (): Promise<ModelPricingData> => {
	const cached = await CacheManager.getJson<ModelPricingData>(CACHE_KEY);
	if (cached) return cached;

	try {
		const data = await fetchFromSource();
		CacheManager.setJson(CACHE_KEY, data, TTL_PRIMARY).catch(() => {});
		CacheManager.setJson(STALE_KEY, data, TTL_STALE).catch(() => {});
		return data;
	} catch {
		const stale = await CacheManager.getJson<ModelPricingData>(STALE_KEY);
		if (stale) return stale;
		throw new InternalError({
			message: "Failed to fetch models.dev pricing and no cache available",
			code: ErrCode.InternalError,
		});
	}
};
