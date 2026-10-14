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
	resetsLikeStripeUnderNone?: boolean;
}): LineItem[] => {
	if (billingContext.skipBillingChanges) {
		return [];
	}

	const hasProratedPeriod =
		billingContext.stripeSubscription !== undefined ||
		billingContextToNewSubscriptionAnchorMs({ billingContext }) !== undefined ||
		isNewSubscriptionBackdate({ billingContext });
	// set_plans only: like Stripe's trial_end now, ending a trial in place bills the full period under none too.
	const billsTrialEnd =
		billingContext.prorationOverride === "bills_full_period";
	const skipsProration =
		billingContext.requestedProrationBehavior === "none" &&
		hasProratedPeriod &&
		!billsTrialEnd;
	const resetsCycleNow = resetsLikeStripeUnderNone
		? billingContext.requestedBillingCycleAnchor === "now"
		: billingContext.anchorResetRefund?.noPartialRefund;
	if (skipsProration && !resetsCycleNow) {
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

	if (customLineItems?.length) {
		autumnBillingPlan.customLineItems = customLineItems;
		return [];
	}

	let finalizedLineItems = filterLineItemsForTrialTransition({
		ctx,
		lineItems: billedLineItems,
		billingContext,
	});

	finalizedLineItems = filterUnchangedPricesFromLineItems({
		lineItems: finalizedLineItems,
	});

	finalizedLineItems = prorateBillDifferenceCredits({
		lineItems: finalizedLineItems,
		billingContext,
	});

	const sharedTrialLineItems = buildSharedSubscriptionTrialLineItems({
		ctx,
		billingContext,
		autumnBillingPlan,
	});
	finalizedLineItems = [...finalizedLineItems, ...sharedTrialLineItems];

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
