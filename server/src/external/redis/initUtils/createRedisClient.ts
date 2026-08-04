import { Redis } from "ioredis";
import { instrumentRedis } from "../otel/instrumentRedis.js";
import { redisDnsLookup } from "./redisDnsLookup.js";
import { registerRedisCommands } from "./registerRedisCommands.js";

const REDIS_COMMAND_TIMEOUT_MS =
	process.env.NODE_ENV === "production" ? 10_000 : 60_000;

/** V2 (Dragonfly/dedicated) clients run a much tighter budget than the misc cache. */
export const REDIS_V2_COMMAND_TIMEOUT_MS =
	process.env.NODE_ENV === "production" ? 1_000 : 10_000;

const formatRedisEndpoint = ({ cacheUrl }: { cacheUrl: string }) => {
	try {
		const url = new URL(cacheUrl);
		return `${url.protocol}//${url.host}`;
	} catch {
		return "<invalid redis url>";
	}
};

export const createRedisClient = ({
	cacheUrl,
	region,
	cacheCert = process.env.CACHE_CERT || null,
	commandTimeout = REDIS_COMMAND_TIMEOUT_MS,
}: {
	cacheUrl: string;
	region: string;
	cacheCert?: string | null;
	commandTimeout?: number;
}): Redis => {
	console.log(
		`[Redis] ${region}: connecting to ${formatRedisEndpoint({ cacheUrl })}`,
	);

	const usesTls = cacheUrl.startsWith("rediss:");

	const instance = new Redis(cacheUrl, {
		tls: cacheCert
			? { ca: cacheCert }
			: usesTls
				? { lookup: redisDnsLookup }
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
