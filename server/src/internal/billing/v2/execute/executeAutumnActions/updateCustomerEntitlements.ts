import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
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
	}
};
