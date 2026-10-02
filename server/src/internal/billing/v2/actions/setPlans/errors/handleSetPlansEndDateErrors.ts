import type { CreateScheduleBillingContext } from "@autumn/shared";
import { invalidSetPlansRequest } from "./invalidSetPlansRequest";
import { setPlansError } from "./setPlansError";

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
		throw setPlansError({
			details: {
				type: "date_order",
				date: "end_date",
				date_ms: endsAt,
				boundary: "last_phase",
				boundary_ms: lastPhase.starts_at,
			},
		});
	}
};
