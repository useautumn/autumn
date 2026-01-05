import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AutumnBillingPlan } from "@/internal/billing/v2/billingPlan";
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
		const { balanceChange, customerEntitlementId } = updateDetail;

		if (balanceChange > 0) {
			logger.info(
				`Incrementing entitlement for customer entitlement ID (${customerEntitlementId}) by ${balanceChange} units`,
			);

			await CusEntService.increment({
				db,
				id: customerEntitlementId,
				amount: balanceChange,
			});
		} else if (balanceChange < 0) {
			const absoluteDecrement = Math.abs(balanceChange);

			logger.info(
				`Decrementing entitlement for feature ${customerEntitlementId} by ${absoluteDecrement} units`,
			);

			await CusEntService.decrement({
				db,
				id: customerEntitlementId,
				amount: absoluteDecrement,
			});
		}
	}

	logger.info("Successfully updated all customer entitlements");
};
