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
				"db.redis.slow": true,
			}
		: {};
