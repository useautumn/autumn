import {
	type CreateScheduleBillingContext,
	ms,
	RecaseError,
} from "@autumn/shared";

const FIRST_PHASE_TOLERANCE_MS = ms.minutes(1);

export const handleCreateScheduleErrors = ({
	billingContext,
	isPreview = false,
}: {
	billingContext: CreateScheduleBillingContext;
	isPreview?: boolean;
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

	if (!billingContext.checkoutMode) return;

	throw new RecaseError({
		message: isPreview
			? "Please attach a payment method before creating a schedule."
			: "create_schedule requires an immediately billable first phase; checkout flows are not supported yet",
		statusCode: 400,
	});
};
