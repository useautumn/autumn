import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getRampDestinationRedis,
	isDragonflyRampActive,
} from "@/internal/misc/dragonflyRamp/index.js";
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
		redis: resolveRedisV2({ orgId: org.id, customerId }),
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
	// Fan out invalidations to the ramp destination when the ramp is non-zero —
	// without this, ramped customers can read stale entries from whichever
	// cluster invalidation skipped.
	if (isDragonflyRampActive({ orgId: org.id })) {
		const destination = getRampDestinationRedis();
		if (destination) redisTargets.push(destination);
	}
	return [...new Set(redisTargets)];
};
