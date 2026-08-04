import type { Redis } from "ioredis";

/**
 * Proxy that re-resolves the underlying client on EVERY property access, so the
 * module-level `miscRedis` singleton can be repointed (instance switch in the
 * misc-redis edge config) mid-flight without call sites re-importing anything.
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
