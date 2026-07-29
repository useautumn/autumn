import type { Attributes } from "@opentelemetry/api";

export const buildRedisSpanOutcomeAttributes = ({
	durationMs,
	slowMs,
}: {
	durationMs: number;
	slowMs: number;
}): Attributes =>
	durationMs > slowMs
		? {
				"db.redis.duration_ms": durationMs,
				"db.redis.slow": true,
				"db.redis.breach_ratio": slowMs > 0 ? durationMs / slowMs : 0,
			}
		: {
				"db.redis.duration_ms": durationMs,
			};
