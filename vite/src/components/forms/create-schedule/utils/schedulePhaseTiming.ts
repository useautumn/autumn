import {
	isFutureStartDate,
	isPastStartDate,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
} from "@autumn/shared";
import { format } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

/** A new single phase starting now is a plain plan set, with no schedule timing to show. */
export const isUnscheduledPlanSet = ({
	phases,
	isExistingSchedule,
}: {
	phases: { startsAt: number | null }[];
	isExistingSchedule: boolean;
}) => !isExistingSchedule && phases.length === 1 && phases[0]?.startsAt == null;

/** The first phase starts further ahead than set_plans treats as now, so billing waits until then. */
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

/** The first phase starts further back than set_plans treats as now, so it backdates. */
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

/** A backdated first phase, or a started one moved before its saved start, makes set_plans recreate the live subscription. */
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
