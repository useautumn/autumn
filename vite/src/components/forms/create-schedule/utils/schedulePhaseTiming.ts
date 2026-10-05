import {
	isFutureStartDate,
	isPastStartDate,
	SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
} from "@autumn/shared";
import { format } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

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

/** A new schedule whose backdated first phase makes set_plans recreate the live subscription. */
export const firstPhaseBackdatesLiveSubscription = ({
	phases,
	nowMs,
	isExistingSchedule,
	hasActiveSubscription,
}: {
	phases: { startsAt: number | null }[];
	nowMs: number;
	isExistingSchedule: boolean;
	hasActiveSubscription: boolean;
}) =>
	!isExistingSchedule &&
	hasActiveSubscription &&
	firstPhaseIsBackdated({ phases, nowMs });

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d, yyyy");
