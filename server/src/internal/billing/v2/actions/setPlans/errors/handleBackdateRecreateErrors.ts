import {
	backdateSetsNewBillingTerms,
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	isCustomerProductOnStripeSubscription,
	type SetPlansBackdateConflict,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { exceedsStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { replacedSubscriptionPeriodEndMs } from "../utils/replacedSubscriptionPeriodEndMs";
import { restartsCycleAtBackdatedStart } from "../utils/restartsCycleAtBackdatedStart";
import { setPlansError } from "./setPlansError";

/** Only the live period end, or a restart on the backdated start alone, keeps every period billed once. */
const movesBillingCycleAnchor = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { requestedBillingCycleAnchor } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return false;
	if (restartsCycleAtBackdatedStart({ billingContext })) return true;
	if (requestedBillingCycleAnchor === "now") return true;
	return (
		truncateMsToSecondPrecision(requestedBillingCycleAnchor) !==
		replacedSubscriptionPeriodEndMs(billingContext)
	);
};

/** A paid subscription's recreate continues the period it paid, so it can't add a trial, outlive that period or move its anchor. */
const paidPeriodConflict = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): SetPlansBackdateConflict | undefined => {
	if (billingContext.trialContext?.trialEndsAt) return "free_trial";

	const periodEndMs = replacedSubscriptionPeriodEndMs(billingContext);
	if (
		periodEndMs === undefined ||
		periodEndMs <= billingContext.currentEpochMs
	) {
		return "period_ended";
	}
	return movesBillingCycleAnchor({ billingContext })
		? "billing_cycle_anchor"
		: undefined;
};

/** A plan the recreated subscription would leave behind on the cancelled one. */
const planLeftOnReplacedSubscription = ({
	billingContext,
	timeline,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: Pick<SetPlansTimeline, "outOfScopeCustomerProductIds">;
}) => {
	const replacedSubscriptionId = billingContext.replacedStripeSubscription?.id;
	if (!replacedSubscriptionId) return undefined;

	const outOfScopeIds = new Set(timeline.outOfScopeCustomerProductIds);
	return billingContext.fullCustomer.customer_products.find(
		(customerProduct) =>
			outOfScopeIds.has(customerProduct.id) &&
			customerProductHasRelevantStatus(customerProduct) &&
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId: replacedSubscriptionId,
			}) === true,
	);
};

const backdateConflict = ({
	billingContext,
	timeline,
	preview,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: Pick<SetPlansTimeline, "outOfScopeCustomerProductIds">;
	preview: boolean;
}): { conflict: SetPlansBackdateConflict; plan_name?: string } | undefined => {
	if (!preview && billingContext.checkoutMode === "stripe_checkout") {
		return { conflict: "stripe_checkout" };
	}
	const setsNewBillingTerms = backdateSetsNewBillingTerms({
		liveSubscriptionTrialing: isStripeSubscriptionTrialing(
			billingContext.replacedStripeSubscription,
		),
	});
	const paidConflict = setsNewBillingTerms
		? undefined
		: paidPeriodConflict({ billingContext });
	if (paidConflict) return { conflict: paidConflict };
	if (
		exceedsStripeBackdateInvoiceLineItemLimit({
			products: billingContext.fullProducts,
			startsAt: billingContext.immediatePhase.starts_at,
			currentEpochMs: billingContext.currentEpochMs,
		})
	) {
		return { conflict: "too_far_back" };
	}

	const leftBehind = planLeftOnReplacedSubscription({
		billingContext,
		timeline,
	});
	return leftBehind
		? { conflict: "plan_outside_request", plan_name: leftBehind.product.name }
		: undefined;
};

/** A backdate recreates the live subscription, so anything the recreate would lose or bill twice is rejected first. */
export const handleBackdateRecreateErrors = ({
	billingContext,
	timeline,
	preview,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: Pick<SetPlansTimeline, "outOfScopeCustomerProductIds">;
	preview: boolean;
}) => {
	const conflict = backdateConflict({ billingContext, timeline, preview });
	if (!conflict) return;

	throw setPlansError({
		details: {
			type: "backdate_conflict",
			starts_at: billingContext.immediatePhase.starts_at,
			...conflict,
		},
	});
};
