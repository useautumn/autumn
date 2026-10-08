import {
	type CreateScheduleBillingContext,
	ErrCode,
	isProductPaidAndRecurring,
	RecaseError,
	type SetPlansFutureStartConflict,
} from "@autumn/shared";
import { isExistingScheduleUpdate } from "@/internal/billing/v2/actions/setPlans/utils/isExistingScheduleUpdate";
import { assertNoBackdateWithExistingSubscription } from "@/internal/billing/v2/utils/backdate/assertNoBackdateWithExistingSubscription";
import { assertStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { isTrialBackdateRecreate } from "../utils/isTrialBackdateRecreate";
import { handleBackdateRecreateErrors } from "./handleBackdateRecreateErrors";
import { setPlansError } from "./setPlansError";

const futureStartConflict = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): SetPlansFutureStartConflict | undefined => {
	if (billingContext.trialContext?.trialEndsAt) return "free_trial";
	if (billingContext.invoiceMode) return "invoice_mode";
	if (billingContext.requestedBillingCycleAnchor !== undefined) {
		return "billing_cycle_anchor";
	}
	return undefined;
};

const handleFutureStartErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const conflict = futureStartConflict({ billingContext });
	if (!conflict) return;

	throw setPlansError({
		details: {
			type: "future_start_conflict",
			conflict,
			starts_at: billingContext.immediatePhase.starts_at,
		},
	});
};

const handlePastStartErrors = ({
	billingContext,
	timeline,
	preview,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: Pick<SetPlansTimeline, "outOfScopeCustomerProductIds">;
	preview: boolean;
}) => {
	const { currentEpochMs, immediatePhase } = billingContext;
	const allImmediateProductsPaidRecurring =
		billingContext.fullProducts.length > 0 &&
		billingContext.fullProducts.every(isProductPaidAndRecurring);

	if (!allImmediateProductsPaidRecurring) {
		throw new RecaseError({
			message:
				"Past first phase starts_at is only supported for paid recurring plans.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const recreatesLiveSubscription =
		isBackdateRecreate({ billingContext }) ||
		isTrialBackdateRecreate({ billingContext });
	if (recreatesLiveSubscription) {
		handleBackdateRecreateErrors({ billingContext, timeline, preview });
		return;
	}

	assertNoBackdateWithExistingSubscription({
		billingContext,
		subject: "Past first phase starts_at",
	});

	// Previews don't yet know whether the caller will settle via invoice
	// (which supports backdating) or Stripe Checkout (which doesn't), so only
	// block the checkout path at execution time.
	if (!preview && billingContext.checkoutMode === "stripe_checkout") {
		throw new RecaseError({
			message:
				"Past first phase starts_at cannot be used when Stripe Checkout is required.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message:
				"Past first phase starts_at cannot be used together with a free trial.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	assertStripeBackdateInvoiceLineItemLimit({
		products: billingContext.fullProducts,
		startsAt: immediatePhase.starts_at,
		currentEpochMs,
		subject: "Past first phase starts_at",
	});
};

export const handleFirstPhaseStartDateErrors = ({
	billingContext,
	timeline,
	preview = false,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: Pick<SetPlansTimeline, "outOfScopeCustomerProductIds">;
	preview?: boolean;
}) => {
	const firstPhaseStart = classifyFirstPhaseStart({
		startsAt: billingContext.immediatePhase.starts_at,
		currentEpochMs: billingContext.currentEpochMs,
	});

	if (firstPhaseStart === "future") {
		handleFutureStartErrors({ billingContext });
		return;
	}

	if (firstPhaseStart !== "past") return;

	// A past start that keeps the live subscription or schedule replays its plans' own start,
	// never a request to bill from it.
	const replaysLiveStart =
		!!billingContext.stripeSubscription ||
		isExistingScheduleUpdate({ billingContext });
	if (replaysLiveStart) return;
	handlePastStartErrors({ billingContext, timeline, preview });
};
