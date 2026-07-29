import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	getRampDestinationRedis,
	isCacheV2RampEnabled,
} from "@/internal/misc/cacheV2Ramp/index.js";
import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";
import { getActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";
import {
	getAlternateRedisV2Instance,
	redisV2 as redisV2Primary,
} from "./initRedisV2.js";

let lastLoggedInstance: RedisV2InstanceName | null = null;
let publicRouteWarned = false;

export type ResolvedRedisV2InstanceName = RedisV2InstanceName | "ramp";

export const getRedisV2ByInstanceName = (name: string): Redis | null => {
	if (name === "dragonfly") return redisV2Primary;
	if (name === "ramp") return getRampDestinationRedis();
	if (name === "upstash" || name === "redis") {
		return getAlternateRedisV2Instance(name);
	}
	return null;
};

const resolveRedisV2InstanceName = ({
	activeInstance,
	customerId,
}: {
	activeInstance: RedisV2InstanceName;
	customerId?: string;
}): ResolvedRedisV2InstanceName => {
	if (activeInstance !== "dragonfly") {
		return getAlternateRedisV2Instance(activeInstance)
			? activeInstance
			: "dragonfly";
	}

	if (
		isCacheV2RampEnabled({ customerId }) &&
		getRampDestinationRedis()
	) {
		return "ramp";
	}
	return "dragonfly";
};

export const getCurrentRedisV2InstanceName = (opts?: {
	customerId?: string;
}): ResolvedRedisV2InstanceName =>
	resolveRedisV2InstanceName({
		activeInstance: getActiveRedisV2Instance(),
		customerId: opts?.customerId,
	});

/** Returns the V2 Redis instance for this request.
 *
 *  Routing order:
 *  1. If `redis-v2-cache` edge config selects a non-dragonfly instance
 *     (`upstash`/`redis`), honor it — that's a global override / kill switch
 *     and trumps the ramp.
 *  2. Otherwise (active = dragonfly), if the ramp is enabled for this
 *     customer/org AND a destination is configured → ramp destination client.
 *  3. Otherwise → primary Dragonfly.
 *
 *  Called by every ctx-building middleware/worker — request-path code reads
 *  ctx.redisV2 rather than calling this. */
export const resolveRedisV2 = (opts?: { customerId?: string }): Redis => {
	const activeInstance = getActiveRedisV2Instance();

	if (activeInstance !== lastLoggedInstance) {
		logger.info(
			`[resolveRedisV2] activeInstance switched to "${activeInstance}"`,
		);
		lastLoggedInstance = activeInstance;
	}

	const instanceName = resolveRedisV2InstanceName({
		activeInstance,
		customerId: opts?.customerId,
	});
	if (
		activeInstance === "dragonfly" &&
		instanceName === "dragonfly" &&
		isCacheV2RampEnabled({ customerId: opts?.customerId }) &&
		!publicRouteWarned
	) {
		publicRouteWarned = true;
		logger.warn(
			"[resolveRedisV2] cache V2 ramp enabled but destination is not configured (or decryption failed); falling back to primary",
		);
	}
	return getRedisV2ByInstanceName(instanceName) ?? redisV2Primary;
};
