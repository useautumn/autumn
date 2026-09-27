import { createRedisClient as createClient } from "@autumn/cache";
import { getCacheEnv } from "@autumn/env/cache";
import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { RedisClientType } from "../otel/instrumentRedis.js";
import { createRedisReadPool } from "./createRedisReadPool.js";
import { createStandbyRedisRouter } from "./createStandbyRedisRouter.js";
import { onRedisClientCreated } from "./onRedisClientCreated.js";

/** V2 (Dragonfly/dedicated) clients run a much tighter budget than the misc cache. */
export const REDIS_V2_COMMAND_TIMEOUT_MS =
	process.env.NODE_ENV === "production" ? 1_000 : 10_000;

/** The server's binding of the shared client: otel tracing and the Lua commands on every connection. */
export const createRedisClient = ({
	cacheUrl,
	region,
	redisType,
	commandTimeout = getCacheEnv().MISC_CACHE_COMMAND_TIMEOUT_MS,
	autoResendUnfulfilledCommands = true,
	maxRetriesPerRequest = null,
}: {
	cacheUrl: string;
	region: string;
	redisType: RedisClientType;
	commandTimeout?: number;
	autoResendUnfulfilledCommands?: boolean;
	maxRetriesPerRequest?: number | null;
}): Redis =>
	createClient({
		ctx: { logger, onClientCreated: onRedisClientCreated },
		config: {
			url: cacheUrl,
			label: `${region}:${redisType}`,
			commandTimeoutMs: commandTimeout,
			autoResendUnfulfilledCommands,
			maxRetriesPerRequest,
		},
	});

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

/** Two read lanes, each retaining the preferred/standby failover pair. */
export const createPooledStandbyRedisConnection = ({
	region,
	...options
}: Parameters<typeof createRedisClient>[0]): Redis =>
	createRedisReadPool({
		lanes: [
			createStandbyRedisConnection({ ...options, region }),
			createStandbyRedisConnection({
				...options,
				region: `${region}:lane-1`,
			}),
		],
	});
