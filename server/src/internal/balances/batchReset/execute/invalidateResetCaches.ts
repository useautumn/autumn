import type { Redis } from "ioredis";
import { resolveCustomerRedisRouting } from "@/external/redis/customerRedisRouting.js";
import type { CustomerEntitlementBalanceInvalidation } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCustomerEntitlementBalances.js";
import { batchInvalidateCustomerEntitlementBalances } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCustomerEntitlementBalances.js";
import type { BatchResetGroup, ResetMutation } from "../types.js";

/**
 * Drops the V2 shared subject-balance hash state for every customer
 * entitlement a reset mutation touched: one HDEL pipeline (cusEnt field +
 * aggregated field) per routed redis client. Pipelines never span groups, so
 * each stays org-scoped (cluster slot safety).
 *
 * Deletion, not patching — the next read rehydrates from Postgres. The
 * legacy FullCustomer cache is dead and intentionally not touched.
 */
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

		for (const [redisV2, invalidations] of invalidationsByRedis) {
			await batchInvalidateCustomerEntitlementBalances({
				redisV2,
				invalidations,
			});
		}
	}
};
