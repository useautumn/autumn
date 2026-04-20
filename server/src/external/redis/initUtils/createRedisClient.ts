import { Redis } from "ioredis";
import { instrumentRedis } from "../otel/instrumentRedis.js";
import { cacheBackupUrl } from "./redisConfig.js";
import { registerRedisCommands } from "./registerRedisCommands.js";

/** Create a Redis connection for a specific region */
export const createRedisClient = ({
	cacheUrl,
	region,
}: {
	cacheUrl: string;
	region: string;
}): Redis => {
	const instance = new Redis(cacheUrl, {
		tls:
			process.env.CACHE_CERT && !cacheBackupUrl
				? { ca: process.env.CACHE_CERT }
				: undefined,
		family: 4,
		keepAlive: 10000,
	});

	// instrumentRedis must run first so its defineCommand patch
	// is in place when commands are registered.
	instrumentRedis({ redis: instance, region });
	registerRedisCommands({ redisInstance: instance });

	return instance;
};

export const createRedisConnection = createRedisClient;

export const createDisabledRedis = (): Redis =>
	new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === "status") return "end";
				if (prop === "defineCommand") return () => undefined;
				if (prop === "on" || prop === "once") return () => undefined;
				if (prop === "connect" || prop === "quit") {
					return async () => undefined;
				}
				if (prop === "disconnect") {
					return () => undefined;
				}
				return async () => {
					throw new Error("Redis is not configured");
				};
			},
		},
	) as Redis;
