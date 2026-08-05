import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** Pinned: written at OAuth start and consumed at the provider callback — two
 *  different requests, so ramp routing would break the handoff. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export const buildOAuthStateKey = (stateKey: string) =>
	`oauth_state:${stateKey}`;

export const getOAuthStateData = async <T>({
	stateKey,
}: {
	stateKey: string;
}): Promise<T | null> => {
	const miscRedis = getMiscRedis();
	const redisKey = buildOAuthStateKey(stateKey);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(redisKey),
		source: "oauth-state-store:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as T;
};

export const setOAuthStateData = async ({
	stateKey,
	data,
}: {
	stateKey: string;
	data: unknown;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const redisKey = buildOAuthStateKey(stateKey);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				redisKey,
				JSON.stringify(data),
				"EX",
				OAUTH_STATE_TTL_SECONDS,
			),
		source: "oauth-state-store:set",
		redisInstance: miscRedis,
	});
};

export const deleteOAuthStateData = async ({
	stateKey,
}: {
	stateKey: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const redisKey = buildOAuthStateKey(stateKey);

	await tryRedisOp({
		operation: () => miscRedis.del(redisKey),
		source: "oauth-state-store:delete",
		redisInstance: miscRedis,
	});
};
