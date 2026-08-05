import type { Context } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { hasRedisV2Config, redisV2 } from "@/external/redis/initRedisV2.js";
import {
	describeRedisWithStandby,
	isRedisReadyWithStandby,
} from "@/external/redis/initUtils/standbyRedis.js";
import type { HonoEnv } from "./HonoEnv";
import { evaluateStartupGate } from "./startupGate.js";

const startedAt = Date.now();
let startupReady = false;
let miscReadyListenerAttached = false;

const tryLatchStartupReady = () => {
	if (startupReady) return;

	let miscRedisStatus: string;
	try {
		const miscRedis = getMiscRedis();
		if (!miscReadyListenerAttached) {
			miscReadyListenerAttached = true;
			miscRedis.once("ready", tryLatchStartupReady);
		}
		miscRedisStatus = miscRedis.status;
	} catch {
		// CACHE_URL not injected yet — stay unready; health checks keep retrying.
		return;
	}

	const { ready, reason } = evaluateStartupGate({
		redisReady: miscRedisStatus === "ready",
		redisV2Ready: !hasRedisV2Config || isRedisReadyWithStandby(redisV2),
		elapsedMs: Date.now() - startedAt,
	});
	if (!ready) return;
	startupReady = true;
	logger.info(`[health-check] startup gate latched (${reason})`, {
		redis_status: miscRedisStatus,
		redis_v2_status: describeRedisWithStandby(redisV2),
		has_redis_v2_config: hasRedisV2Config,
	});
};

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
