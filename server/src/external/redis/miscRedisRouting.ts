import type { Redis } from "ioredis";
import type { MainRedisInstanceName } from "@/internal/misc/mainRedisCache/mainRedisCacheSchemas.js";

export const selectMiscRedisClient = ({
	activeInstance,
	primary,
	fallback,
}: {
	activeInstance: MainRedisInstanceName;
	primary: () => Redis;
	fallback: Redis | null;
}): Redis => (activeInstance === "fallback" && fallback ? fallback : primary());

/**
 * Proxy that re-resolves the underlying client on EVERY property access, so the
 * module-level `miscRedis` singleton can be repointed (e.g. primary→fallback)
 * mid-flight without call sites re-importing anything.
 */
export const createMiscRedisRouter = ({
	resolve,
}: {
	resolve: () => Redis;
}): Redis =>
	new Proxy({} as Redis, {
		get(_target, property) {
			const redis = resolve();
			const value = Reflect.get(redis, property, redis);
			return typeof value === "function" ? value.bind(redis) : value;
		},
		set(_target, property, value) {
			return Reflect.set(resolve(), property, value);
		},
	});
