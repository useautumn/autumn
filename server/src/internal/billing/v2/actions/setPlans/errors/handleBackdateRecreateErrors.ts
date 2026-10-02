import {
	type CreateScheduleBillingContext,
	customerProductHasRelevantStatus,
	isCustomerProductOnStripeSubscription,
	type SetPlansErrorDetails,
	secondsToMs,
} from "@autumn/shared";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT } from "@/internal/billing/v2/utils/backdate/countBackdatedPeriods";
import { countStripeBackdateInvoiceLineItems } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { setPlansError } from "./setPlansError";

type BackdateConflict = Extract<
	SetPlansErrorDetails,
	{ type: "backdate_conflict" }
>;

const ANCHOR_PRECISION_MS = 1000;

const trialConflict = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) =>
	!!billingContext.trialContext?.trialEndsAt ||
	billingContext.replacedStripeSubscription?.status === "trialing";

const movesBillingCycleAnchor = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { requestedBillingCycleAnchor, replacedStripeSubscription } =
		billingContext;
	if (requestedBillingCycleAnchor === undefined) return false;
	if (requestedBillingCycleAnchor === "now" || !replacedStripeSubscription) {
		return true;
	}

	const periodEndMs = secondsToMs(
		getLatestPeriodEnd({ sub: replacedStripeSubscription }),
	);
	return (
		Math.abs(requestedBillingCycleAnchor - periodEndMs) >= ANCHOR_PRECISION_MS
	);
};

const exceedsStripeBackdateLimit = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) =>
	countStripeBackdateInvoiceLineItems({
		products: billingContext.fullProducts,
		startsAt: billingContext.immediatePhase.starts_at,
		currentEpochMs: billingContext.currentEpochMs,
	}) > STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT;

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
}): Omit<BackdateConflict, "type" | "starts_at"> | undefined => {
	if (trialConflict({ billingContext })) return { conflict: "free_trial" };
	if (!preview && billingContext.checkoutMode === "stripe_checkout") {
		return { conflict: "stripe_checkout" };
	}
	if (movesBillingCycleAnchor({ billingContext })) {
		return { conflict: "billing_cycle_anchor" };
	}
	if (exceedsStripeBackdateLimit({ billingContext })) {
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
