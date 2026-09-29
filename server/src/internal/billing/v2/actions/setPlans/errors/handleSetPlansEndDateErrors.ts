import type { CreateScheduleBillingContext } from "@autumn/shared";
import { invalidSetPlansRequest } from "./invalidSetPlansRequest";

export const handleSetPlansEndDateErrors = ({
	billingContext,
	endsAt,
}: {
	billingContext: CreateScheduleBillingContext;
	endsAt?: number;
}) => {
	if (endsAt === undefined) return;

	if (endsAt <= billingContext.currentEpochMs) {
		throw invalidSetPlansRequest(
			"ends_at cannot be set to a past timestamp. Use a future Unix timestamp in milliseconds.",
		);
	}

	const lastPhase =
		billingContext.futurePhases.at(-1) ?? billingContext.immediatePhase;
	if (endsAt <= lastPhase.starts_at) {
		throw invalidSetPlansRequest(
			"ends_at must be after the last phase starts.",
		);
	}
};
