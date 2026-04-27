import {
	type CreateScheduleBillingContext,
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
