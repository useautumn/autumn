import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService";
import { incrementCachedCusEntBalance } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/incrementCachedCusEntBalance";

/**
 * Update customer entitlement balances based on quantity changes.
 * Uses relative Postgres increments (CusEntService.increment/decrement) which
 * bump cache_version, and also applies matching Redis increments to keep the
 * FullCustomer cache in sync (safe for all callers — other billing actions
 * typically nuke the cache afterward; for auto top-up it's essential).
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService";

/**
 * Update customer entitlement balances and replaceables based on quantity changes.
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
		const {
			balanceChange = 0,
			customerEntitlement,
			updates,
			insertReplaceables,
			deletedReplaceables,
		} = updateDetail;

		logger.debug(
			`updating customer entitlement ${customerEntitlement.id} ${balanceChange ? `+${balanceChange}` : updates ? JSON.stringify(updates) : "none"}`,
		);

		// 1. Handle field-level updates (e.g. next_reset_at, adjustment, entities)
		if (updates) {
			await CusEntService.update({
				ctx,
				id: customerEntitlement.id,
				updates,
			});
			continue;
		}

		// 2. Handle balance change
		if (balanceChange > 0) {
			await CusEntService.increment({
				ctx,
				id: customerEntitlement.id,
				amount: balanceChange,
			});
		} else if (balanceChange < 0) {
			await CusEntService.decrement({
				ctx,
				id: customerEntitlement.id,
				amount: Math.abs(balanceChange),
			});
		}

		// 3. Handle replaceable inserts
		if (insertReplaceables && insertReplaceables.length > 0) {
			await RepService.insert({
				ctx,
				data: insertReplaceables,
			});
		}

		// 4. Handle replaceable deletes
		if (deletedReplaceables && deletedReplaceables.length > 0) {
			await RepService.deleteInIds({
				ctx,
				ids: deletedReplaceables.map((r) => r.id),
			});
		}

		// Sync the balance change to Redis cache (atomic increment via Lua).
		// This keeps cache_version aligned with the Postgres bump from
		// CusEntService.increment/decrement, so sync_balances_v2 conflict
		// detection works correctly.
		if (balanceChange !== 0) {
			const customerId =
				customerEntitlement.customer_id ??
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
