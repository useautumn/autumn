import { Redis } from "ioredis";
import { getRedisCommandTimeoutMs } from "@/internal/misc/redisTimeout/redisTimeoutStore.js";
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
	// Read from edge config at construction time. ioredis's commandTimeout is
	// baked into the client, so changes to the edge config require a pod
	// restart to take effect on existing connections.
	const commandTimeoutMs = getRedisCommandTimeoutMs();
	const instance = new Redis(cacheUrl, {
		tls:
			process.env.CACHE_CERT && !cacheBackupUrl
				? { ca: process.env.CACHE_CERT }
				: undefined,
		family: 4,
		keepAlive: 10000,
		...(commandTimeoutMs !== null ? { commandTimeout: commandTimeoutMs } : {}),
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
