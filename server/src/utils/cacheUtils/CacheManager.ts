import { getPrimaryRedis } from "../../external/redis/initRedis.js";

export class CacheManager {
	public static async getJson<T>(key: string): Promise<T | null> {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return null;
		}

		const res = await redis.get(key);

		if (!res) {
			return null;
		}

		return JSON.parse(res);
	}

	public static async setJson(
		key: string,
		value: unknown,
		ttl: number | string = 3600,
	) {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		if (typeof ttl === "number") {
			await redis.set(key, JSON.stringify(value), "EX", ttl);
		} else if (typeof ttl === "string" && ttl.toLowerCase() === "forever") {
			await redis.set(key, JSON.stringify(value));
		}
	}

	public static async del(key: string) {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		await redis.del(key);
	}

	public static async invalidate({
		action,
		value,
	}: {
		action: string;
		value: string;
	}) {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		await redis.del(`${action}:${value}`);
	}

	static async disconnect() {
		const redis = getPrimaryRedis();
		if (redis.status !== "ready") {
			console.warn("Cache client is not in ready state");
			return;
		}

		await redis.quit();
	}
}
