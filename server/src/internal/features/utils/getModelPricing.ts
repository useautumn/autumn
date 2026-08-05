import { ErrCode, InternalError } from "@autumn/shared";
import {
	getCachedModelPricing,
	getCachedStaleModelPricing,
	type ModelPricingData,
	setCachedModelPricing,
} from "@/external/redis/actions/modelPricingCache/modelPricingCache.js";

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
	const cached = await getCachedModelPricing();
	if (cached) return cached;

	try {
		const data = await fetchFromSource();
		// Fire-and-forget: never-throwing (tryRedisOp), and tracks shouldn't wait on it.
		void setCachedModelPricing({ data });
		return data;
	} catch {
		const stale = await getCachedStaleModelPricing();
		if (stale) return stale;
		throw new InternalError({
			message: "Failed to fetch models.dev pricing and no cache available",
			code: ErrCode.InternalError,
		});
	}
};
