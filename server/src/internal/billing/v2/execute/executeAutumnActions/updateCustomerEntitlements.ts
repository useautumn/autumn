import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { incrementCachedCusEntBalance } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/incrementCachedCusEntBalance";

/**
 * Update customer entitlement balances based on quantity changes.
 * Uses relative Postgres increments (CusEntService.increment/decrement) which
 * bump cache_version, and also applies matching Redis increments to keep the
 * FullCustomer cache in sync (safe for all callers — other billing actions
 * typically nuke the cache afterward; for auto top-up it's essential).
 */
export const updateCustomerEntitlements = async ({
	ctx,
	updates,
}: {
	ctx: AutumnContext;
	updates: AutumnBillingPlan["updateCustomerEntitlements"];
}) => {
	const { logger } = ctx;

	for (const updateDetail of updates ?? []) {
		const { balanceChange = 0, customerEntitlement, updates } = updateDetail;

		logger.debug(
			`updating customer entitlement ${customerEntitlement.id} ${balanceChange ? `+${balanceChange}` : updates ? JSON.stringify(updates) : "none"}`,
		);

		if (updates) {
			await CusEntService.update({
				ctx,
				id: customerEntitlement.id,
				updates,
			});
			continue;
		}

		if (balanceChange > 0) {
			await CusEntService.increment({
				ctx,
				id: customerEntitlement.id,
				amount: balanceChange,
			});
		} else if (balanceChange < 0) {
			const absoluteDecrement = Math.abs(balanceChange);

			await CusEntService.decrement({
				ctx,
				id: customerEntitlement.id,
				amount: absoluteDecrement,
			});
		}

		// Sync the balance change to Redis cache (atomic increment via Lua).
		// This keeps cache_version aligned with the Postgres bump from
		// CusEntService.increment/decrement, so sync_balances_v2 conflict
		// detection works correctly.
		if (balanceChange !== 0) {
			const customerId =
				customerEntitlement.customer_id ||
				customerEntitlement.internal_customer_id;

			await incrementCachedCusEntBalance({
				ctx,
				customerId,
				cusEntId: customerEntitlement.id,
				delta: balanceChange,
			});
		}
	}
};
