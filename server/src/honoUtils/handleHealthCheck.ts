import type { Context } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import { hasRedisConfig, redis } from "@/external/redis/initRedis.js";
import { hasRedisV2Config, redisV2 } from "@/external/redis/initRedisV2.js";
import type { HonoEnv } from "./HonoEnv";

let startupReady = false;

const tryLatchStartupReady = () => {
	if (startupReady) return;
	const redisOk = !hasRedisConfig || redis.status === "ready";
	const redisV2Ok = !hasRedisV2Config || redisV2.status === "ready";
	if (!redisOk || !redisV2Ok) return;
	startupReady = true;
	logger.info("[health-check] startup gate latched", {
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
