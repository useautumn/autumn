import type { ModelsDevProvider } from "@autumn/shared";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

export type ModelPricingData = Record<string, ModelsDevProvider>;

/** Pinned: global (non-org) read-through of models.dev — no request affinity,
 *  and a flip just refetches. Stale copy outlives the primary as a fallback
 *  for models.dev outages. */
export const MODEL_PRICING_CACHE_KEY = "models_dev_pricing";
export const MODEL_PRICING_STALE_CACHE_KEY = "models_dev_pricing_stale";
export const MODEL_PRICING_TTL_SECONDS = 60 * 60 * 3;
export const MODEL_PRICING_STALE_TTL_SECONDS = 60 * 60 * 24 * 3;

const getJson = async ({
	cacheKey,
	source,
}: {
	cacheKey: string;
	source: string;
}): Promise<ModelPricingData | null> => {
	const miscRedis = getMiscRedis();

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source,
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as ModelPricingData;
};

export const getCachedModelPricing =
	async (): Promise<ModelPricingData | null> =>
		getJson({
			cacheKey: MODEL_PRICING_CACHE_KEY,
			source: "model-pricing-cache:get",
		});

export const getCachedStaleModelPricing =
	async (): Promise<ModelPricingData | null> =>
		getJson({
			cacheKey: MODEL_PRICING_STALE_CACHE_KEY,
			source: "model-pricing-cache:get-stale",
		});

export const setCachedModelPricing = async ({
	data,
}: {
	data: ModelPricingData;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const serialized = JSON.stringify(data);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				MODEL_PRICING_CACHE_KEY,
				serialized,
				"EX",
				MODEL_PRICING_TTL_SECONDS,
			),
		source: "model-pricing-cache:set",
		redisInstance: miscRedis,
	});
	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				MODEL_PRICING_STALE_CACHE_KEY,
				serialized,
				"EX",
				MODEL_PRICING_STALE_TTL_SECONDS,
			),
		source: "model-pricing-cache:set-stale",
		redisInstance: miscRedis,
	});
};
