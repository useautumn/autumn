import { redis } from "../../../external/redis/initRedis.js";
import {
	tryRedisRead,
	tryRedisWrite,
} from "../../../utils/cacheUtils/cacheUtils.js";

export const addSubIdToCache = async ({
	subId,
	scenario,
}: {
	subId: string;
	scenario: string;
}) => {
	await tryRedisWrite(async () => {
		await redis.set(`sub:${subId}`, scenario, "EX", 180); // 3 minutes
	});
};
export const getSubScenarioFromCache = async ({ subId }: { subId: string }) => {
	return await tryRedisRead(async () => {
		return await redis.get(`sub:${subId}`);
	});
};
