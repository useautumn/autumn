import type { Redis } from "ioredis";
import type { MainRedisInstanceName } from "@/internal/misc/mainRedisCache/mainRedisCacheSchemas.js";

export const selectMainRedisClient = ({
	activeInstance,
	primary,
	fallback,
}: {
	activeInstance: MainRedisInstanceName;
	primary: () => Redis;
	fallback: Redis | null;
}): Redis => (activeInstance === "fallback" && fallback ? fallback : primary());

export const createMainRedisRouter = ({
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
