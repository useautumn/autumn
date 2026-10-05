import {
	isFutureStartDate,
	isPastStartDate,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
} from "@autumn/shared";

export type FirstPhaseStart = "now" | "past" | "future";

/** Whether the first phase starts now, was backdated, or starts later, within set_plans' tolerance. */
export const classifyFirstPhaseStart = ({
	startsAt,
	currentEpochMs,
}: {
	startsAt: number;
	currentEpochMs: number;
}): FirstPhaseStart => {
	if (
		isFutureStartDate(
			startsAt,
			currentEpochMs,
			SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
		)
	) {
		return "future";
	}
	if (
		isPastStartDate(
			startsAt,
			currentEpochMs,
			SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
		)
	) {
		return "past";
	}
	return "now";
};

/** The context's first phase starts later than now. */
export const firstPhaseStartsInFuture = ({
	billingContext,
}: {
	billingContext: {
		immediatePhase: { starts_at: number };
		currentEpochMs: number;
	};
}) =>
	classifyFirstPhaseStart({
		startsAt: billingContext.immediatePhase.starts_at,
		currentEpochMs: billingContext.currentEpochMs,
	}) === "future";

/** A first phase starting within the tolerance of now bills from now, so its plan starts active. */
export const firstPhaseBillingStartsAt = ({
	startsAt,
	currentEpochMs,
}: {
	startsAt: number;
	currentEpochMs: number;
}) =>
	classifyFirstPhaseStart({ startsAt, currentEpochMs }) === "now"
		? currentEpochMs
		: startsAt;
