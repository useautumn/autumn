import {
	backdateAcceptsFreeTrial,
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	isCustomerProductOnStripeSubscription,
	type SetPlansBackdateConflict,
} from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { exceedsStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { replacedSubscriptionPeriodEndMs } from "../utils/replacedSubscriptionPeriodEndMs";
import { setPlansError } from "./setPlansError";

/** A paid subscription's recreate continues the period it paid, which must still be running. */
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
	const requestsTrial = !!billingContext.trialContext?.trialEndsAt;
	const acceptsFreeTrial = backdateAcceptsFreeTrial({
		liveSubscriptionTrialing: isStripeSubscriptionTrialing(
			billingContext.replacedStripeSubscription,
		),
	});
	if (requestsTrial && !acceptsFreeTrial) return { conflict: "free_trial" };
	if (paidPeriodEnded({ billingContext })) return { conflict: "period_ended" };
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
