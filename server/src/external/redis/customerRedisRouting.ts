import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getRampDestinationRedis,
	isCacheV2RampActive,
} from "@/internal/misc/cacheV2Ramp/index.js";
import { getActiveRedisV2Instance } from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";
import { redisV2 as redisV2Primary } from "./initRedisV2.js";
import { getOrgRedis, type OrgWithRedisConfig } from "./orgRedisPool.js";
import { resolveRedisV2 } from "./resolveRedisV2.js";

export {
	type CustomerRedisRoutingInfo,
	getCustomerBucket,
	getCustomerRedisRoutingId,
	isRedisMigrationCacheStale,
} from "./customerRedisRoutingInfo.js";

import {
	type CustomerRedisRoutingInfo,
	getCustomerRedisRoutingInfoForOrg,
} from "./customerRedisRoutingInfo.js";

export const getCustomerRedisRoutingInfo = ({
	org,
	customerId,
}: {
	org: OrgWithRedisConfig;
	customerId?: string;
}): CustomerRedisRoutingInfo => {
	return getCustomerRedisRoutingInfoForOrg({
		org,
		customerId,
	});
};

export const resolveCustomerRedisRouting = ({
	org,
	customerId,
}: {
	org: OrgWithRedisConfig;
	customerId?: string;
}): CustomerRedisRoutingInfo & { redis: Redis } => {
	const routingInfo = getCustomerRedisRoutingInfo({ org, customerId });

	if (routingInfo.usesDedicatedRedis) {
		return {
			...routingInfo,
			redis: getOrgRedis({ org }),
		};
	}

	return {
		...routingInfo,
		redis: resolveRedisV2({ customerId }),
	};
};

export const getCtxWithCustomerRedis = <T extends AutumnContext>({
	ctx,
	customerId = ctx.customerId,
}: {
	ctx: T;
	customerId?: string;
}): { ctx: T; routingInfo: CustomerRedisRoutingInfo } => {
	const routingInfo = resolveCustomerRedisRouting({
		org: ctx.org,
		customerId,
	});

	return {
		ctx: {
			...ctx,
			redisV2: routingInfo.redis,
		} as T,
		routingInfo,
	};
};

export const overrideCtxRedisV2 = ({
	ctx,
	redisV2,
}: {
	ctx: AutumnContext;
	redisV2: Redis;
}): AutumnContext => {
	if (ctx.redisV2 === redisV2) return ctx;

	const injectedCtx = Object.create(ctx) as AutumnContext;
	injectedCtx.redisV2 = redisV2;
	return injectedCtx;
};

export const getRedisUrlForCustomer = ({
	org,
	customerId,
}: {
	org: OrgWithRedisConfig;
	customerId?: string;
}): string | undefined => {
	return getCustomerRedisRoutingInfo({ org, customerId }).redisUrl;
};

export const getRedisTargetsForCustomer = ({
	org,
	currentRedis,
}: {
	org: OrgWithRedisConfig;
	currentRedis?: Redis;
}): Redis[] => {
	const redisTargets = [currentRedis ?? resolveRedisV2()];
	if (org.redis_config) {
		redisTargets.push(resolveRedisV2(), getOrgRedis({ org }));
	}
	// During ramp, fan out to BOTH primary and destination. `currentRedis` may
	// already be the destination (ramped customer) or the primary (non-ramped);
	// without explicitly including both, the other cluster keeps stale entries
	// until TTL. Gated on activeInstance === "dragonfly" so the upstash/redis
	// kill switch disables the ramp fan-out.
	if (getActiveRedisV2Instance() === "dragonfly" && isCacheV2RampActive()) {
		const destination = getRampDestinationRedis();
		if (destination) {
			// Use redisV2Primary directly: at 100% ramp, resolveRedisV2() with no
			// args still goes through isCacheV2RampEnabled (which returns true
			// when migrationPercent >= 100 regardless of customerId), so it
			// would return the destination — leaving primary out of the fan-out.
			redisTargets.push(destination, redisV2Primary);
		}
	}
	return [...new Set(redisTargets)];
};
