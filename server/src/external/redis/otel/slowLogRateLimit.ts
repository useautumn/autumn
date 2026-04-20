/**
 * Token-bucket rate limiter for `redis_slow_command` logs.
 *
 * Prevents flooding Axiom when a slow operation is happening in a hot loop.
 * Per-operation bucket: up to MAX_PER_MINUTE events per operation per minute.
 *
 * Process-local (in-memory); does not coordinate across instances, which is
 * fine — the aggregate otel spans still capture everything for percentiles.
 */

const MAX_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const shouldEmitSlowLog = ({
	operation,
}: {
	operation: string;
}): boolean => {
	const now = Date.now();
	const bucket = buckets.get(operation);
	if (!bucket || bucket.resetAt < now) {
		buckets.set(operation, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (bucket.count >= MAX_PER_MINUTE) return false;
	bucket.count++;
	return true;
};
