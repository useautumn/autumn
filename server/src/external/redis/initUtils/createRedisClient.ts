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
	commandTimeout = REDIS_COMMAND_TIMEOUT_MS,
}: {
	cacheUrl: string;
	region: string;
	supportsUpstashShebang?: boolean;
	commandTimeout?: number;
}): Redis => {
	const instance = new Redis(cacheUrl, {
		tls:
			process.env.CACHE_CERT && !cacheBackupUrl
				? { ca: process.env.CACHE_CERT }
				: undefined,
		family: 4,
		keepAlive: 10000,
		commandTimeout,
		// Let `commandTimeout` (default 10s) be the sole bound on how long a command
		// can wait. `maxRetriesPerRequest: null` disables ioredis's default
		// "flush pending commands after N reconnect attempts" behavior, which
		// otherwise aborts commands still in the offline queue on any minor
		// handshake blip. Under a real brownout, commands still fail via the
		// `Command timed out` path.
		maxRetriesPerRequest: null,
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
