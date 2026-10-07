import {
	type FullCusProduct,
	getCycleEnd,
	isResettingEntitlement,
	timestampsMatch,
} from "@autumn/shared";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

/** The product keeps its cycle; balances clamped to the dropped reset go back to their own next cycle end. */
export const planOrphanedBillingCycleAnchorReset = ({
	customerProduct,
	nowMs,
	plan,
}: {
	customerProduct: FullCusProduct;
	nowMs: number;
	plan: AutumnBillingPlanBuilder;
}) => {
	const resetsAt = customerProduct.billing_cycle_anchor_resets_at;
	plan.updateCustomerProduct({
		customerProduct,
		updates: { billing_cycle_anchor_resets_at: null },
	});
	if (typeof resetsAt !== "number") return;

	for (const customerEntitlement of customerProduct.customer_entitlements) {
		const { entitlement, next_reset_at: nextResetAt } = customerEntitlement;
		const clampedToReset =
			typeof nextResetAt === "number" && timestampsMatch(nextResetAt, resetsAt);
		if (!clampedToReset || !isResettingEntitlement({ entitlement })) continue;

		plan.updateCustomerEntitlement({
			customerEntitlement,
			updates: {
				next_reset_at: getCycleEnd({
					anchor:
						customerEntitlement.reset_cycle_anchor ??
						customerProduct.billing_cycle_anchor ??
						customerProduct.starts_at,
					interval: entitlement.interval!,
					intervalCount: entitlement.interval_count,
					now: nowMs,
				}),
			},
		});
	}
};
