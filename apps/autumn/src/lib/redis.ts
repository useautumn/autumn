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
	const keys = await redis.keys("chat-sdk:lock:*");
	if (keys.length === 0) return 0;
	await redis.del(...keys);
	return keys.length;
}
