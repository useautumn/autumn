import type { Redis } from "ioredis";
import { resolveCustomerRedisRouting } from "@/external/redis/customerRedisRouting.js";
import type { CustomerEntitlementBalanceInvalidation } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCustomerEntitlementBalances.js";
import { batchInvalidateCustomerEntitlementBalances } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCustomerEntitlementBalances.js";
import { markCustomersUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import type { BatchResetGroup, ResetMutation } from "../types.js";

export const invalidateResetCaches = async ({
	resetGroups,
	resetMutations,
}: {
	resetGroups: BatchResetGroup[];
	resetMutations: ResetMutation[];
}) => {
	const mutatedIds = new Set(
		resetMutations.map(({ customerEntitlementId }) => customerEntitlementId),
	);
	if (mutatedIds.size === 0) return;

	for (const group of resetGroups) {
		const invalidationsByRedis = new Map<
			Redis,
			CustomerEntitlementBalanceInvalidation[]
		>();

		for (const customerEntitlement of group.customerEntitlements) {
			if (!mutatedIds.has(customerEntitlement.id)) continue;

			const customer = customerEntitlement.customer;
			if (!customer.id) continue;

			const routing = resolveCustomerRedisRouting({
				org: group.ctx.org,
				customerId: customer.id,
			});
			const invalidations = invalidationsByRedis.get(routing.redis) ?? [];
			invalidations.push({
				orgId: customer.org_id,
				env: customer.env,
				customerId: customer.id,
				featureId: customerEntitlement.entitlement.feature.id,
				customerEntitlementId: customerEntitlement.id,
			});
			invalidationsByRedis.set(routing.redis, invalidations);
		}

		const invalidateRedisCaches = async () => {
			for (const [redisV2, invalidations] of invalidationsByRedis) {
				await batchInvalidateCustomerEntitlementBalances({
					redisV2,
					invalidations,
				});
			}
		};

		// would serve pre-reset balances); concurrent so it never waits on Redis.
		await Promise.all([
			invalidateRedisCaches(),
			markCustomersUpdatedAt({
				customers: [...invalidationsByRedis.values()]
					.flat()
					.map(({ orgId, env, customerId }) => ({ orgId, env, customerId })),
			}),
		]);
	}
};
