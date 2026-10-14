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
		maxRetriesPerRequest,
		autoResendUnfulfilledCommands,
	});

	if (ctx.logger) rememberClientLogger({ redis, logger: ctx.logger });
	ctx.onClientCreated?.({ redis, label });
	return redis;
};
