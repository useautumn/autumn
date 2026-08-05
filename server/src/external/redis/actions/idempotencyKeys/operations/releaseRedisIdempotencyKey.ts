import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

export const releaseRedisIdempotencyKey = async ({
	storageKey,
}: {
	storageKey: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();

	await tryRedisOp({
		operation: () => miscRedis.del(storageKey),
		source: "idempotency-key:release",
		redisInstance: miscRedis,
	});
};
