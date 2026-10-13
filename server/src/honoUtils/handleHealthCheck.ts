import type { Context } from "hono";
import { hasBalanceWorkerRoutingSettled } from "@/external/balanceWorker/balanceWorkerRoutingStartup.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { hasRedisV2Config, redisV2 } from "@/external/redis/initRedisV2.js";
import type { HonoEnv } from "./HonoEnv";
import { evaluateStartupGate } from "./startupGate.js";

const startedAt = Date.now();
let startupReady = false;
let miscReadyListenerAttached = false;

const tryLatchStartupReady = (): string | null => {
	if (startupReady) return null;

	let miscRedisStatus: string;
	try {
		const miscRedis = getMiscRedis();
		if (!miscReadyListenerAttached) {
			miscReadyListenerAttached = true;
			miscRedis.once("ready", tryLatchStartupReady);
		}
		miscRedisStatus = miscRedis.status;
	} catch {
		// Misc cache env not injected yet — stay unready; health checks keep retrying.
		return "Redis not ready";
	}

	const { ready, reason } = evaluateStartupGate({
		redisReady: miscRedisStatus === "ready",
		redisV2Ready: !hasRedisV2Config || redisV2.status === "ready",
		routingReady: hasBalanceWorkerRoutingSettled(),
		elapsedMs: Date.now() - startedAt,
	});
	if (!ready) return reason;
	startupReady = true;
	logger.info(`[health-check] startup gate latched (${reason})`, {
		redis_status: miscRedisStatus,
		redis_v2_status: redisV2.status,
		has_redis_v2_config: hasRedisV2Config,
	});
	return null;
};

if (hasRedisV2Config) redisV2.once("ready", tryLatchStartupReady);
tryLatchStartupReady();

export const handleHealthCheck = async (c: Context<HonoEnv>) => {
	if (!startupReady) {
		const waitingFor = tryLatchStartupReady();
		if (!startupReady) {
			return c.text(waitingFor ?? "Redis not ready", 503);
		}
	}
	return c.text("Hello from Autumn (test 1) 🍂🍂🍂");
};
