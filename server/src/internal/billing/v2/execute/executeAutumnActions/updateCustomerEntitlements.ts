import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions";
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
			await customerEntitlementActions.updateDbAndCache({
				ctx,
				customerId:
					customerEntitlement.customer_id ??
					customerEntitlement.internal_customer_id,
				cusEntId: customerEntitlement.id,
				updates,
			});
			continue;
		}

		// 2. Handle balance change (DB + cache)
		if (balanceChange !== 0) {
			const customerId =
				customerEntitlement.customer_id ??
				customerEntitlement.internal_customer_id;

			await customerEntitlementActions.adjustBalanceDbAndCache({
				ctx,
				customerId,
				cusEntId: customerEntitlement.id,
				delta: balanceChange,
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
	}
};
