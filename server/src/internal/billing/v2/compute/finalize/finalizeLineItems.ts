import {
	type AutumnBillingPlan,
	type BillingContext,
	type CustomLineItem,
	filterUnchangedPricesFromLineItems,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { buildSharedSubscriptionTrialLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildSharedSubscriptionTrialLineItems";
import { filterLineItemsForTrialTransition } from "@/internal/billing/v2/compute/computeAutumnUtils/filterLineItemsForTrialTransition";
import { dropUnchangedSubscriptionItemCharges } from "@/internal/billing/v2/compute/finalize/dropUnchangedSubscriptionItemCharges";
import { isUsageNoSubscriptionBilled } from "@/internal/billing/v2/compute/finalize/isUsageNoSubscriptionBilled";
import { prorateBillDifferenceCredits } from "@/internal/billing/v2/compute/finalize/prorateBillDifferenceCredits";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import { isNewSubscriptionBackdate } from "@/internal/billing/v2/utils/backdate/isNewSubscriptionBackdate";
import { billingContextToNewSubscriptionAnchorMs } from "@/internal/billing/v2/utils/billingContext/billingContextToNewSubscriptionAnchorMs";

/**
 * Finalizes line items for a billing plan by:
 * 1. If custom line items are provided, overrides computed line items entirely
 * 2. Filtering line items based on trial state transitions
 * 3. Filtering out unchanged prices (refund + charge pairs that cancel out)
 * 4. Adding line items for sibling products affected by trial state changes
 * 5. Applying Stripe discounts to line items
 */
export const finalizeLineItems = ({
	ctx,
	lineItems,
	billingContext,
	autumnBillingPlan,
	customLineItems,
	resetsLikeStripeUnderNone = false,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	customLineItems?: CustomLineItem[];
	/** set_plans only: like Stripe, a reset now under none never credits and charges only the items it changes. */
	resetsLikeStripeUnderNone?: boolean;
}): LineItem[] => {
	if (billingContext.skipBillingChanges) {
		return [];
	}

	// "none" skips prorated charges: mid-cycle changes on a subscription, the stub
	// before a new subscription's anchor, or a new subscription's backdated cycles.
	const hasProratedPeriod =
		billingContext.stripeSubscription !== undefined ||
		billingContextToNewSubscriptionAnchorMs({ billingContext }) !== undefined ||
		isNewSubscriptionBackdate({ billingContext });
	const skipsProration =
		billingContext.requestedProrationBehavior === "none" && hasProratedPeriod;
	const resetsCycleNow = resetsLikeStripeUnderNone
		? billingContext.requestedBillingCycleAnchor === "now"
		: billingContext.anchorResetRefund?.noPartialRefund;
	if (skipsProration && !resetsCycleNow) {
		// set_plans only: usage of a plan no subscription billed is still owed under none.
		const unbilledUsage = isSetPlansBillingContext(billingContext)
			? lineItems.filter(isUsageNoSubscriptionBilled)
			: [];
		if (unbilledUsage.length === 0) return [];
		lineItems = unbilledUsage;
	}

	const billedLineItems =
		skipsProration && resetsLikeStripeUnderNone
			? dropUnchangedSubscriptionItemCharges({
					ctx,
					billingContext,
					lineItems: lineItems.filter(
						({ context }) =>
							context.direction === "charge" ||
							context.billingTiming === "in_arrear",
					),
				})
			: lineItems;

	// 0. If custom line items provided, override computed line items entirely
	if (customLineItems?.length) {
		autumnBillingPlan.customLineItems = customLineItems;
		return [];
	}

	// 1. Filter line items based on trial state transitions
	let finalizedLineItems = filterLineItemsForTrialTransition({
		ctx,
		lineItems: billedLineItems,
		billingContext,
	});

	// 2. Filter out unchanged prices (refund + charge pairs that cancel out)
	finalizedLineItems = filterUnchangedPricesFromLineItems({
		lineItems: finalizedLineItems,
	});

	finalizedLineItems = prorateBillDifferenceCredits({
		lineItems: finalizedLineItems,
		billingContext,
	});

	// 3. Add line items for sibling products affected by trial state changes
	const sharedTrialLineItems = buildSharedSubscriptionTrialLineItems({
		ctx,
		billingContext,
		autumnBillingPlan,
	});
	finalizedLineItems = [...finalizedLineItems, ...sharedTrialLineItems];

	// 4. Apply Stripe discounts if present
	if (billingContext.stripeDiscounts?.length) {
		finalizedLineItems = applyStripeDiscountsToLineItems({
			lineItems: finalizedLineItems,
			discounts: billingContext.stripeDiscounts,
			options: {
				disableDiscountableForFreshDiscounts: true,
			},
		});
	}

	return finalizedLineItems;
};
