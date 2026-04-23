import { logger } from "@/external/logtail/logtailUtils.js";
import { addRedisToLogs } from "@/utils/logging/addContextToLogs.js";
import type { RedisKeyContext } from "./parseRedisKeyContext.js";
import type { ResolvedThresholds } from "./redisSlowlogConfig.js";
import { shouldEmitSlowLog } from "./slowLogRateLimit.js";

/**
 * Emits a structured `redis_slow_command` log for commands that exceeded
 * their severe threshold. Rate-limited per-operation to avoid flooding.
 */
export const emitRedisSlowLog = ({
	operation,
	durationMs,
	thresholds,
	keyContext,
	region,
	key,
}: {
	operation: string;
	durationMs: number;
	thresholds: ResolvedThresholds;
	keyContext: RedisKeyContext;
	region?: string;
	key?: string;
}): void => {
	try {
		if (!shouldEmitSlowLog({ operation })) return;

		const slowMs = thresholds.slowMs;
		const breachRatio = slowMs > 0 ? durationMs / slowMs : 0;

		addRedisToLogs({
			logger,
			redisData: {
				operation,
				duration_ms: durationMs,
				slow_ms: slowMs,
				base_slow_ms: thresholds.baseSlowMs,
				region_baseline_ms: thresholds.regionBaselineMs,
				severe_ms: thresholds.severeMs,
				breach_ratio: breachRatio,
				region,
				key,
				org_id: keyContext.orgId,
				customer_id: keyContext.customerId,
				entity_id: keyContext.entityId,
			},
		}).warn({ type: "redis_slow_command" }, "Redis slow command");
	} catch {
		// swallow — telemetry must never break app commands
	}
};
