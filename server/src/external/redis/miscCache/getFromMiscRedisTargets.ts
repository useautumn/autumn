import { tryRedisOp } from "../utils/runRedisOp.js";
import { getMiscRedisTargets } from "./resolveMiscRedis.js";

/** Read a cross-request key from the active instance first, then any other
 *  live target — a flip mid-handoff can leave the value on either side. */
export const getFromMiscRedisTargets = async ({
	key,
	source,
}: {
	key: string;
	source: string;
}): Promise<string | null> => {
	for (const { redis } of getMiscRedisTargets()) {
		const value = await tryRedisOp({
			operation: () => redis.get(key),
			source,
			redisInstance: redis,
		});
		if (value) return value;
	}
	return null;
};
