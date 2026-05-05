import {
	type CreateScheduleBillingContext,
	ErrCode,
	ms,
	RecaseError,
} from "@autumn/shared";

const FIRST_PHASE_TOLERANCE_MS = ms.minutes(15);

export const handleCreateScheduleErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { currentEpochMs, immediatePhase, stripeSubscriptionSchedule } =
		billingContext;

	if (
		billingContext.checkoutMode === "stripe_checkout" &&
		billingContext.enablePlanImmediately &&
		(billingContext.adjustableFeatureQuantities?.length ?? 0) > 0
	) {
		throw new RecaseError({
			message:
				"enable_plan_immediately cannot be used with adjustable feature quantities — set adjustable_quantity to false on each option, or remove enable_plan_immediately.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Updates reuse the existing schedule's current-phase start_date downstream
	// (see executeStripeSubscriptionScheduleAction.buildAnchoredPhases), so the
	// caller-supplied starts_at for phase 0 is effectively ignored. The
	// immediate-start guard only makes sense on creation.
	if (stripeSubscriptionSchedule) return;

	if (
		immediatePhase.starts_at < currentEpochMs - FIRST_PHASE_TOLERANCE_MS ||
		immediatePhase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS
	) {
		throw new RecaseError({
			message: "The first phase must start immediately",
			statusCode: 400,
		});
	}
};
