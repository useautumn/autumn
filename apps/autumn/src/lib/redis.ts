import Redis from "ioredis";
import { getEnv } from "@/config";

let _redis: Redis | null = null;

export function getRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(getEnv().REDIS_URL);
	}
	return _redis;
}

export async function flushStaleLocks(): Promise<number> {
	const redis = getRedis();
	const pattern = "chat-sdk:lock:*";
	let cursor = "0";
	let deleted = 0;

	do {
		const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
		cursor = next;
		if (keys.length === 0) continue;
		await redis.del(...keys);
		deleted += keys.length;
	} while (cursor !== "0");

	return deleted;
}
