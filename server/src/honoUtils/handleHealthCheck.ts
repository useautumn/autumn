import type { Context } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { HonoEnv } from "./HonoEnv";

let startupReady = false;

const isDisabledRedis = (status: string) => status === "end";

const tryLatchStartupReady = () => {
	if (startupReady) return;
	const redisOk = redis.status === "ready" || isDisabledRedis(redis.status);
	const redisV2Ok =
		redisV2.status === "ready" || isDisabledRedis(redisV2.status);
	if (!redisOk || !redisV2Ok) return;
	startupReady = true;
	logger.info("[health-check] startup gate latched", {
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
