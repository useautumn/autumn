import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

/**
 * Update customer entitlement balances based on quantity changes.
 * @param ctx - The Autumn context.
 * @param quantityUpdateDetails - List of quantity update details impacting entitlement balances.
 */
export const updateCustomerEntitlements = async ({
	ctx,
	updates,
}: {
	ctx: AutumnContext;
	updates: AutumnBillingPlan["updateCustomerEntitlements"];
}) => {
	const { db, logger } = ctx;

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
	}
};
