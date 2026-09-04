import type { Redis } from "ioredis";

export type RedisUnavailableReason =
	| "not_ready"
	| "timeout"
	| "connection"
	| "other";

export class RedisUnavailableError extends Error {
	readonly reason: RedisUnavailableReason;
	readonly source: string;

	constructor({
		source,
		reason,
		cause,
	}: {
		source: string;
		reason: RedisUnavailableReason;
		cause?: unknown;
	}) {
		super(`[redis-unavailable] source=${source} reason=${reason}`);
		this.name = "RedisUnavailableError";
		this.source = source;
		this.reason = reason;
		if (cause !== undefined) this.cause = cause;
	}
}

const classifyRedisUnavailable = ({
	redis,
	error,
}: {
	redis: Redis;
	error: unknown;
}): RedisUnavailableReason => {
	if (redis.status !== "ready") return "not_ready";
	const message = error instanceof Error ? error.message : String(error);
	if (/ETIMEDOUT|timeout/i.test(message)) return "timeout";
	if (/ECONN|closed|writeable|max retries/i.test(message)) return "connection";
	return "other";
};

export const runRedisOp = async <T>({
	operation,
	source,
	redis,
	queueIfNotReady = false,
}: {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redis: Redis;
	queueIfNotReady?: boolean;
}): Promise<T> => {
	if (!queueIfNotReady && redis.status !== "ready") {
		throw new RedisUnavailableError({ source, reason: "not_ready" });
	}
	try {
		return await operation(redis);
	} catch (error) {
		throw new RedisUnavailableError({
			source,
			reason: classifyRedisUnavailable({ redis, error }),
			cause: error,
		});
	}
};

export const tryRedisOp = async <T>({
	onError,
	...params
}: Parameters<typeof runRedisOp<T>>[0] & {
	onError?: (error: unknown) => void;
}): Promise<T | undefined> => {
	try {
		return await runRedisOp(params);
	} catch (error) {
		onError?.(error);
		return undefined;
	}
};
