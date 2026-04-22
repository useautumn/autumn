import { Redis } from "ioredis";
import { instrumentRedis } from "../otel/instrumentRedis.js";
import { cacheBackupUrl } from "./redisConfig.js";
import { registerRedisCommands } from "./registerRedisCommands.js";

const REDIS_COMMAND_TIMEOUT_MS = 10_000;

/** Create a Redis connection for a specific region.
 *  `supportsUpstashShebang` defaults to true; set false for non-Upstash
 *  providers (ElastiCache, Dragonfly, self-hosted) that reject the
 *  `allow-key-locking` shebang flag. */
export const createRedisClient = ({
	cacheUrl,
	region,
	supportsUpstashShebang = true,
}: {
	cacheUrl: string;
	region: string;
	supportsUpstashShebang?: boolean;
}): Redis => {
	const instance = new Redis(cacheUrl, {
		tls:
			process.env.CACHE_CERT && !cacheBackupUrl
				? { ca: process.env.CACHE_CERT }
				: undefined,
		family: 4,
		keepAlive: 10000,
		commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
		// Fail-open: never buffer commands while disconnected, never retry
		// failed commands. A dead/slow Redis must not back up requests.
		enableOfflineQueue: false,
		maxRetriesPerRequest: 0,
	});

	// instrumentRedis must run first so its defineCommand patch
	// is in place when commands are registered.
	instrumentRedis({ redis: instance, region });
	registerRedisCommands({ redisInstance: instance, supportsUpstashShebang });

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
