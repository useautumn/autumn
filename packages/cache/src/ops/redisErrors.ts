export type UnavailableReason =
	| "not_ready"
	| "timeout"
	| "connection"
	| "other";

/** Thrown by `runRedisOp` when Redis is unavailable; a caller that fails open catches it at its boundary. */
export class RedisUnavailableError extends Error {
	readonly reason: UnavailableReason;
	readonly source: string;

	constructor({
		source,
		reason,
		cause,
	}: {
		source: string;
		reason: UnavailableReason;
		cause?: unknown;
	}) {
		super(`[redis-unavailable] source=${source} reason=${reason}`, { cause });
		this.name = "RedisUnavailableError";
		this.source = source;
		this.reason = reason;
	}
}

const TRANSIENT_REDIS_ERROR_MESSAGES = new Set([
	"Command timed out",
	"Connection is closed.",
]);
const TRANSIENT_REDIS_ERROR_NAMES = new Set(["MaxRetriesPerRequestError"]);
const CONNECTION_LEVEL_ERROR =
	/ETIMEDOUT|timeout|timed out|ECONN|closed|writeable|max retries/i;

/** Failed because of the socket, not the command; wider than transient, to catch a timeout wrapper's message. */
export const isConnectionLevelRedisError = ({
	error,
}: {
	error: unknown;
}): boolean => {
	if (error instanceof RedisUnavailableError) return true;
	if (!(error instanceof Error)) return false;
	if (TRANSIENT_REDIS_ERROR_NAMES.has(error.name)) return true;
	return CONNECTION_LEVEL_ERROR.test(error.message);
};

export const isTransientRedisError = ({
	error,
}: {
	error: unknown;
}): boolean => {
	if (error instanceof RedisUnavailableError) return true;
	if (!(error instanceof Error)) return false;
	if (TRANSIENT_REDIS_ERROR_MESSAGES.has(error.message)) return true;
	return TRANSIENT_REDIS_ERROR_NAMES.has(error.name);
};
