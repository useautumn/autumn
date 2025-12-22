import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import type { QuantityUpdateDetails } from "../../typesOld";

/**
 * Update customer entitlement balances based on quantity changes.
 *
 * Extracted from:
 * - handleQuantityUpgrade.ts:191-206
 * - handleQuantityDowngrade.ts:182-198
 */
export const updateCustomerEntitlements = async ({
	ctx,
	quantityUpdateDetails,
}: {
	ctx: AutumnContext;
	quantityUpdateDetails: QuantityUpdateDetails[];
}) => {
	const { db, logger } = ctx;

	for (const updateDetail of quantityUpdateDetails) {
		if (!updateDetail.customerEntitlementId) {
			logger.info(
				`No entitlement found for feature ${updateDetail.featureId}, skipping entitlement update`,
			);
			continue;
		}

		const {
			customerEntitlementBalanceChange,
			customerEntitlementId,
			featureId,
		} = updateDetail;

		if (customerEntitlementBalanceChange > 0) {
			logger.info(
				`Incrementing entitlement for feature ${featureId} by ${customerEntitlementBalanceChange} units`,
			);

			await CusEntService.increment({
				db,
				id: customerEntitlementId,
				amount: customerEntitlementBalanceChange,
			});
		} else if (customerEntitlementBalanceChange < 0) {
			const absoluteDecrement = Math.abs(customerEntitlementBalanceChange);

			logger.info(
				`Decrementing entitlement for feature ${featureId} by ${absoluteDecrement} units`,
			);

			await CusEntService.decrement({
				db,
				id: customerEntitlementId,
				amount: absoluteDecrement,
			});
		} else {
			logger.info(
				`No entitlement balance change required for feature ${featureId}`,
			);
		}
	}

	logger.info("Successfully updated all customer entitlements");
};
