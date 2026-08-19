import {
	type AutumnBillingPlan,
	type BillingContext,
	type FullCusProduct,
	getCycleEnd,
	isResettingEntitlement,
} from "@autumn/shared";
import { getRequestedBillingCycleAnchorResetAt } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";
import { entitlementToResetCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";

export const computeBillingCycleAnchorEntitlementUpdates = ({
	billingContext,
	customerProduct,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}): NonNullable<AutumnBillingPlan["updateCustomerEntitlements"]> => {
	if (billingContext.requestedBillingCycleAnchor === undefined) return [];

	const scheduledResetAt = getRequestedBillingCycleAnchorResetAt({
		requestedBillingCycleAnchor: billingContext.requestedBillingCycleAnchor,
	});
	const updates: NonNullable<AutumnBillingPlan["updateCustomerEntitlements"]> =
		[];

	for (const customerEntitlement of customerProduct.customer_entitlements) {
		if (
			!isResettingEntitlement({ entitlement: customerEntitlement.entitlement })
		) {
			continue;
		}

		const naturalResetAt = getCycleEnd({
			anchor: billingContext.resetCycleAnchorMs,
			interval: customerEntitlement.entitlement.interval!,
			intervalCount: customerEntitlement.entitlement.interval_count,
			now: billingContext.currentEpochMs,
		});
		updates.push({
			customerEntitlement,
			updates: {
				...(scheduledResetAt === undefined && {
					reset_cycle_anchor: entitlementToResetCycleAnchor({
						entitlement: customerEntitlement.entitlement,
						resetCycleAnchor: billingContext.resetCycleAnchorMs,
						now: billingContext.currentEpochMs,
					}),
				}),
				next_reset_at:
					scheduledResetAt === undefined
						? naturalResetAt
						: Math.min(naturalResetAt, scheduledResetAt),
			},
		});
	}

	return updates;
};
