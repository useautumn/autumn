import type { AppEnv } from "@autumn/shared";
import { resolveMiscRedis } from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

const TOP_EVENT_NAMES_CACHE_TTL_SECONDS = 60 * 5;

export const buildTopEventNamesCacheKey = ({
	orgId,
	env,
	limit,
}: {
	orgId: string;
	env: AppEnv;
	limit: number;
}) => `top_event_names:${orgId}:${env}:${limit}`;

export const getCachedTopEventNames = async <T>({
	cacheKey,
	requestId,
}: {
	cacheKey: string;
	requestId?: string;
}): Promise<T | null> => {
	const miscRedis = resolveMiscRedis({ requestId });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "top-event-names-cache:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as T;
};

export const setCachedTopEventNames = async ({
	cacheKey,
	value,
	requestId,
}: {
	cacheKey: string;
	value: unknown;
	requestId?: string;
}): Promise<void> => {
	const miscRedis = resolveMiscRedis({ requestId });

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				JSON.stringify(value),
				"EX",
				TOP_EVENT_NAMES_CACHE_TTL_SECONDS,
			),
		source: "top-event-names-cache:set",
		redisInstance: miscRedis,
	});
};
