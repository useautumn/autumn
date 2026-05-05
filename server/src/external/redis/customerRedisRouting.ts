import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrgRedis, type OrgWithRedisConfig } from "./orgRedisPool.js";
import { resolveRedisV2 } from "./resolveRedisV2.js";

export {
	type CustomerRedisRoutingInfo,
	getCustomerBucket,
	getRedisUrlForCustomerFromOrg,
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
		redis: resolveRedisV2(),
	};
};

export const setCustomerRedisRouting = ({
	ctx,
	customerId = ctx.customerId,
}: {
	ctx: AutumnContext;
	customerId?: string;
}): CustomerRedisRoutingInfo => {
	const routingInfo = resolveCustomerRedisRouting({
		org: ctx.org,
		customerId,
	});

	ctx.redisV2 = routingInfo.redis;
	return routingInfo;
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
