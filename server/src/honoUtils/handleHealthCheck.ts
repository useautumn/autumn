import type { Context } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import { hasRedisConfig, redis } from "@/external/redis/initRedis.js";
import { hasRedisV2Config, redisV2 } from "@/external/redis/initRedisV2.js";
import type { HonoEnv } from "./HonoEnv";

// After this long without Redis becoming ready, latch the gate anyway and fall
// back to the runtime fail-open path. Bounds the worst case to a brief startup
// delay instead of an indefinite crash-loop — e.g. when the active V2 instance
// has been failed over to an alternate while the Dragonfly client the gate
// watches never connects. Kept well under the ECS health-check grace period so
// the timeout latch always beats ECS's task-kill timer.
export const STARTUP_GATE_MAX_WAIT_MS = 20_000;

/** Pure decision for the startup gate. `redisReady`/`redisV2Ready` already
 *  fold in "not configured" as ready. Once `elapsedMs` reaches the max wait we
 *  serve regardless, leaving degradation to the runtime fail-open path. */
export const evaluateStartupGate = ({
	redisReady,
	redisV2Ready,
	elapsedMs,
	maxWaitMs = STARTUP_GATE_MAX_WAIT_MS,
}: {
	redisReady: boolean;
	redisV2Ready: boolean;
	elapsedMs: number;
	maxWaitMs?: number;
}): { ready: boolean; reason: string | null } => {
	if (redisReady && redisV2Ready) {
		return { ready: true, reason: "Redis ready" };
	}
	if (elapsedMs >= maxWaitMs) {
		return {
			ready: true,
			reason: "max wait elapsed; serving via runtime fail-open",
		};
	}
	return { ready: false, reason: null };
};

const startedAt = Date.now();
let startupReady = false;

const tryLatchStartupReady = () => {
	if (startupReady) return;
	const { ready, reason } = evaluateStartupGate({
		redisReady: !hasRedisConfig || redis.status === "ready",
		redisV2Ready: !hasRedisV2Config || redisV2.status === "ready",
		elapsedMs: Date.now() - startedAt,
	});
	if (!ready) return;
	startupReady = true;
	logger.info(`[health-check] startup gate latched (${reason})`, {
		redis_status: redis.status,
		redis_v2_status: redisV2.status,
		has_redis_config: hasRedisConfig,
		has_redis_v2_config: hasRedisV2Config,
	});
};

if (hasRedisConfig) redis.once("ready", tryLatchStartupReady);
if (hasRedisV2Config) redisV2.once("ready", tryLatchStartupReady);
tryLatchStartupReady();

export const handleHealthCheck = async (c: Context<HonoEnv>) => {
	if (!startupReady) {
		tryLatchStartupReady();
		if (!startupReady) {
			return c.text("Redis not ready", 503);
		}
	}
	return c.text("Hello from Autumn (test 1) 🍂🍂🍂");
};
