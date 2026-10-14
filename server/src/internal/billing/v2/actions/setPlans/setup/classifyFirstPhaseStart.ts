import {
	isFutureStartDate,
	isPastStartDate,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
} from "@autumn/shared";

export type FirstPhaseStart = "now" | "past" | "future";

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
