import type { UnavailableReason } from "./runRedisOp.js";

/** Thrown by `runRedisOp` when Redis is unavailable (timeout, connection,
 *  not-ready, or other classifiable failure). Callers that want to fail open
 *  should catch this at the request/handler boundary (see `withRedisFailOpen`). */

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
		super(`[redis-unavailable] source=${source} reason=${reason}`);
		this.name = "RedisUnavailableError";
		this.source = source;
		this.reason = reason;
		if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
	}
}
