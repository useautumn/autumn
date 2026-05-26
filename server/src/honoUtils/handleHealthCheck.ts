import type { Context } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { HonoEnv } from "./HonoEnv";

let startupReady = false;

const tryLatchStartupReady = () => {
	if (startupReady) return;
	if (redis.status !== "ready" || redisV2.status !== "ready") return;
	startupReady = true;
	logger.info("[health-check] startup gate latched (Redis ready)", {
		redis_status: redis.status,
		redis_v2_status: redisV2.status,
	});
};

redis.once("ready", tryLatchStartupReady);
redisV2.once("ready", tryLatchStartupReady);
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
