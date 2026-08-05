import type { Context } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import { hasMiscRedisConfig, miscRedis } from "@/external/redis/initRedis.js";
import { hasRedisV2Config, redisV2 } from "@/external/redis/initRedisV2.js";
import type { HonoEnv } from "./HonoEnv";
import { evaluateStartupGate } from "./startupGate.js";

const startedAt = Date.now();
let startupReady = false;

const tryLatchStartupReady = () => {
	if (startupReady) return;
	const { ready, reason } = evaluateStartupGate({
		redisReady: !hasMiscRedisConfig || miscRedis.status === "ready",
		redisV2Ready: !hasRedisV2Config || redisV2.status === "ready",
		elapsedMs: Date.now() - startedAt,
	});
	if (!ready) return;
	startupReady = true;
	logger.info(`[health-check] startup gate latched (${reason})`, {
		redis_status: miscRedis.status,
		redis_v2_status: redisV2.status,
		has_redis_config: hasMiscRedisConfig,
		has_redis_v2_config: hasRedisV2Config,
	});
};

if (hasMiscRedisConfig) miscRedis.once("ready", tryLatchStartupReady);
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
