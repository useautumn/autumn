import { Redis } from "ioredis";
import { rememberClientLogger } from "./clientLogger.js";
import { redisDnsLookup } from "./redisDnsLookup.js";
import type {
	RedisClientConfig,
	RedisClientContext,
} from "./types/redisClient.js";

const formatRedisEndpoint = ({ url }: { url: string }): string => {
	try {
		const parsed = new URL(url);
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return "<invalid redis url>";
	}
};

/** One ioredis connection, configured the way every Autumn process connects; a `get*` accessor owns the instance. */
export const createRedisClient = ({
	ctx,
	config,
}: {
	ctx: RedisClientContext;
	config: RedisClientConfig;
}): Redis => {
	const {
		url,
		label,
		commandTimeoutMs,
		autoResendUnfulfilledCommands = true,
		maxRetriesPerRequest = null,
	} = config;
	ctx.logger?.info(
		`[Redis] ${label}: connecting to ${formatRedisEndpoint({ url })}`,
	);

	const usesTls = url.startsWith("rediss:");
	const redis = new Redis(url, {
		tls: usesTls ? { lookup: redisDnsLookup } : undefined,
		family: 4,
		keepAlive: 10000,
		commandTimeout: commandTimeoutMs,
		// null leaves commandTimeout as the sole bound: ioredis's default flushes the offline
		// queue after N reconnect attempts, which aborts commands on a minor handshake blip.
		maxRetriesPerRequest,
		autoResendUnfulfilledCommands,
	});

	if (ctx.logger) rememberClientLogger({ redis, logger: ctx.logger });
	// Tracing must patch the instance before a process registers its commands on it.
	ctx.onClientCreated?.({ redis, label });
	return redis;
};
