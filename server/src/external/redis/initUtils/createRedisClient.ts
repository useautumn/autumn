import { Redis } from "ioredis";
import {
	instrumentRedis,
	type RedisClientType,
} from "../otel/instrumentRedis.js";
import { createStandbyRedisRouter } from "./createStandbyRedisRouter.js";
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
	redisType,
	commandTimeout = REDIS_COMMAND_TIMEOUT_MS,
	autoResendUnfulfilledCommands = true,
	maxRetriesPerRequest = null,
}: {
	cacheUrl: string;
	region: string;
	redisType: RedisClientType;
	commandTimeout?: number;
	autoResendUnfulfilledCommands?: boolean;
	maxRetriesPerRequest?: number | null;
}): Redis => {
	console.log(
		`[Redis] ${region}: connecting to ${formatRedisEndpoint({ cacheUrl })}`,
	);

	const usesTls = cacheUrl.startsWith("rediss:");

	const instance = new Redis(cacheUrl, {
		tls: usesTls ? { lookup: redisDnsLookup } : undefined,
		family: 4,
		keepAlive: 10000,
		commandTimeout,
		// By default, let `commandTimeout` be the sole bound on how long a command
		// can wait. `maxRetriesPerRequest: null` disables ioredis's default
		// "flush pending commands after N reconnect attempts" behavior, which
		// otherwise aborts commands still in the offline queue on any minor
		// handshake blip. Under a real brownout, commands still fail via the
		// `Command timed out` path.
		maxRetriesPerRequest,
		autoResendUnfulfilledCommands,
	});

	// instrumentRedis must run first so its defineCommand patch
	// is in place when commands are registered.
	instrumentRedis({ redis: instance, region, redisType });
	registerRedisCommands({ redisInstance: instance });

	return instance;
};

export const createRedisConnection = createRedisClient;

/** Two connections to the same endpoint behind a router. Command resend is off,
 *  and pending commands fail on the first reconnect so idempotent reads can retry
 *  immediately on the alternate connection without reordering mutations. */
export const createStandbyRedisConnection = ({
	region,
	...options
}: Parameters<typeof createRedisClient>[0]): Redis =>
	createStandbyRedisRouter({
		primary: createRedisClient({
			...options,
			region: `${region}:primary`,
			autoResendUnfulfilledCommands: false,
			maxRetriesPerRequest: 0,
		}),
		standby: createRedisClient({
			...options,
			region: `${region}:standby`,
			autoResendUnfulfilledCommands: false,
			maxRetriesPerRequest: 0,
		}),
	});
