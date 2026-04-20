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
	const { currentEpochMs, immediatePhase } = billingContext;

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
