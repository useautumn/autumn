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
export type RedisV2RoutingTarget = ResolvedRedisV2InstanceName | "org";

export const getRedisV2ByInstanceName = (name: string): Redis | null => {
	if (name === "dragonfly") return redisV2Primary;
	if (name === "ramp") return getRampDestinationRedis();
	if (name === "upstash" || name === "redis") {
		return getAlternateRedisV2Instance(name);
	}
	return null;
};

export const getRedisV2RoutingTarget = (redis: Redis): RedisV2RoutingTarget => {
	const globalTargets = ["dragonfly", "upstash", "redis", "ramp"] as const;
	for (const target of globalTargets) {
		if (getRedisV2ByInstanceName(target) === redis) {
			return target;
		}
	}
	return "org";
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

	if (isCacheV2RampEnabled({ customerId }) && getRampDestinationRedis()) {
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
