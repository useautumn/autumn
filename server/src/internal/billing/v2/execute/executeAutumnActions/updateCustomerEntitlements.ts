import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

/** Grant field updates and balance changes; their replaceable rows are written with the Postgres-only rows. */
export const updateCustomerEntitlements = async ({
	ctx,
	customerId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	updates: AutumnBillingPlan["updateCustomerEntitlements"];
}) => {
	const { logger } = ctx;

	for (const updateDetail of updates ?? []) {
		const {
			balanceChange = 0,
			entityBalanceChanges,
			moveEntityBalances,
			customerEntitlement,
			updates,
		} = updateDetail;

		logger.debug(
			`updating customer entitlement ${customerEntitlement.id} ${balanceChange ? `+${balanceChange}` : updates ? JSON.stringify(updates) : "none"}`,
		);

		const featureId = customerEntitlement.entitlement.feature.id;
		// 1. Handle field-level updates (e.g. next_reset_at, adjustment, entities)
		if (updates) {
			await customerEntitlementActions.updateDbAndCache({
				ctx,
				customerId,
				cusEntId: customerEntitlement.id,
				updates,
				incrementCacheVersion: true,
				featureId,
			});
			continue;
		}

		// 2. Handle balance change (DB + cache)
		if (balanceChange !== 0) {
			await customerEntitlementActions.adjustBalanceDbAndCache({
				ctx,
				customerId,
				cusEntId: customerEntitlement.id,
				delta: balanceChange,
				featureId,
			});
		}

		// 3. Per-entity moves and deltas (Postgres only; the route's refresh middleware refreshes the cache)
		if (moveEntityBalances && Object.keys(moveEntityBalances).length > 0) {
			await CusEntService.moveEntityBalances({
				ctx,
				id: customerEntitlement.id,
				moves: moveEntityBalances,
			});
		}
		if (entityBalanceChanges && Object.keys(entityBalanceChanges).length > 0) {
			await CusEntService.incrementEntityBalances({
				ctx,
				id: customerEntitlement.id,
				changes: entityBalanceChanges,
			});
		}
	}
};
