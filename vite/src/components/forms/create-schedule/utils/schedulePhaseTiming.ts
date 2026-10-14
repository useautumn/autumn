import {
	isFutureStartDate,
	isPastStartDate,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
} from "@autumn/shared";
import { format } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

export const firstPhaseStartsLater = ({
	phases,
	nowMs,
}: {
	phases: { startsAt: number | null }[];
	nowMs: number;
}) => {
	const startsAt = phases[0]?.startsAt;
	return (
		startsAt != null &&
		isFutureStartDate(startsAt, nowMs, SET_PLANS_FIRST_PHASE_TOLERANCE_MS)
	);
};

const firstPhaseIsBackdated = ({
	phases,
	nowMs,
}: {
	phases: { startsAt: number | null }[];
	nowMs: number;
}) => {
	const startsAt = phases[0]?.startsAt;
	return (
		startsAt != null &&
		isPastStartDate(startsAt, nowMs, SET_PLANS_FIRST_PHASE_TOLERANCE_MS)
	);
};

export const firstPhaseBackdatesLiveSubscription = ({
	phases,
	nowMs,
	isExistingSchedule,
	hasActiveSubscription,
}: {
	phases: { startsAt: number | null; persistedStartsAt?: number | null }[];
	nowMs: number;
	isExistingSchedule: boolean;
	hasActiveSubscription: boolean;
}) => {
	if (!hasActiveSubscription) return false;
	if (!isExistingSchedule) return firstPhaseIsBackdated({ phases, nowMs });

	const persistedStartsAt = phases[0]?.persistedStartsAt;
	return (
		persistedStartsAt != null &&
		persistedStartsAt <= nowMs &&
		firstPhaseIsBackdated({ phases, nowMs: persistedStartsAt })
	);
};

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d, yyyy");
