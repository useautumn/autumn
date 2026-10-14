import {
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	isCustomerProductOnStripeSubscription,
	type SetPlansBackdateConflict,
} from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { replacedSubscriptionPeriodEndMs } from "@/internal/billing/v2/setup/carryReplacedSubscription/replacedSubscriptionPeriodEndMs";
import { exceedsStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { setPlansError } from "./setPlansError";

const paidPeriodEnded = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	if (!isBackdateRecreate({ billingContext })) return false;
	const periodEndMs = replacedSubscriptionPeriodEndMs(billingContext);
	return (
		periodEndMs === undefined || periodEndMs <= billingContext.currentEpochMs
	);
};

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
	const requestsTrial = !!billingContext.trialContext?.trialEndsAt;
	const acceptsFreeTrial = isStripeSubscriptionTrialing(
		billingContext.replacedStripeSubscription,
	);
	if (requestsTrial && !acceptsFreeTrial) return { conflict: "free_trial" };
	if (paidPeriodEnded({ billingContext })) return { conflict: "period_ended" };
	const resetsPaidCycleNow =
		isBackdateRecreate({ billingContext }) &&
		billingContext.requestedBillingCycleAnchor === "now";
	if (resetsPaidCycleNow) return { conflict: "billing_cycle_anchor" };
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
