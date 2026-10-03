import { isFutureStartDate, isPastStartDate, ms } from "@autumn/shared";

export const FIRST_PHASE_TOLERANCE_MS = ms.minutes(15);

export type FirstPhaseStart = "now" | "past" | "future";

/** Whether the first phase starts now, was backdated, or starts later, within set_plans' tolerance. */
export const classifyFirstPhaseStart = ({
	startsAt,
	currentEpochMs,
}: {
	startsAt: number;
	currentEpochMs: number;
}): FirstPhaseStart => {
	if (isFutureStartDate(startsAt, currentEpochMs, FIRST_PHASE_TOLERANCE_MS)) {
		return "future";
	}
	if (isPastStartDate(startsAt, currentEpochMs, FIRST_PHASE_TOLERANCE_MS)) {
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
