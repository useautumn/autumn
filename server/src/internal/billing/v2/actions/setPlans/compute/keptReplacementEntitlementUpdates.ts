import {
	type BillingContext,
	type FullCusProduct,
	isResettingEntitlement,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { entitlementToResetCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";

/** Kept balances reset on the replacement's anchor, as its first renewal bills there; a sooner reset still runs first. */
export const keptReplacementEntitlementUpdates = ({
	billingContext,
	keptCustomerProducts,
}: {
	billingContext: BillingContext;
	keptCustomerProducts: FullCusProduct[];
}): UpdateCustomerEntitlement[] => {
	const { billingCycleAnchorMs, currentEpochMs } = billingContext;
	if (typeof billingCycleAnchorMs !== "number") return [];
	if (billingCycleAnchorMs <= currentEpochMs) return [];

	return keptCustomerProducts.flatMap((customerProduct) =>
		customerProduct.customer_entitlements
			.filter(({ entitlement }) => isResettingEntitlement({ entitlement }))
			.map((customerEntitlement) => ({
				customerEntitlement,
				updates: {
					reset_cycle_anchor: entitlementToResetCycleAnchor({
						entitlement: customerEntitlement.entitlement,
						resetCycleAnchor: billingCycleAnchorMs,
						now: currentEpochMs,
					}),
					next_reset_at: Math.min(
						customerEntitlement.next_reset_at ?? billingCycleAnchorMs,
						billingCycleAnchorMs,
					),
				},
			})),
	);
};
