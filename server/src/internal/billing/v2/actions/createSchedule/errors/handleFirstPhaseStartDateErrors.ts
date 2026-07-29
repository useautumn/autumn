import {
	type CreateScheduleBillingContext,
	ErrCode,
	isProductPaidAndRecurring,
	ms,
	RecaseError,
} from "@autumn/shared";
import { assertNoBackdateWithExistingSubscription } from "@/internal/billing/v2/utils/backdate/assertNoBackdateWithExistingSubscription";
import { assertStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";

export const FIRST_PHASE_TOLERANCE_MS = ms.minutes(15);

export const handleFirstPhaseStartDateErrors = ({
	billingContext,
	preview = false,
}: {
	billingContext: CreateScheduleBillingContext;
	preview?: boolean;
}) => {
	const { currentEpochMs, immediatePhase, stripeSubscriptionSchedule } =
		billingContext;

	// Updates reuse the existing schedule's current-phase start_date downstream
	// (see executeStripeSubscriptionScheduleAction.buildAnchoredPhases), so the
	// caller-supplied starts_at for phase 0 is effectively ignored. The
	// immediate-start guard only makes sense on creation.
	const firstPhaseStartsInPast =
		immediatePhase.starts_at < currentEpochMs - FIRST_PHASE_TOLERANCE_MS;
	const firstPhaseStartsInFuture =
		immediatePhase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS;

	if (!stripeSubscriptionSchedule && firstPhaseStartsInFuture) {
		throw new RecaseError({
			message: "The first phase must start immediately",
			statusCode: 400,
		});
	}

	if (!stripeSubscriptionSchedule && firstPhaseStartsInPast) {
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
	}
};
