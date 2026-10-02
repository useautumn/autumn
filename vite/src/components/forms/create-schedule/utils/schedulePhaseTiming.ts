import { format, isAfter, isBefore } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

/** The first phase is set to start on a later date, so billing waits until then. */
export const firstPhaseStartsLater = ({
	phases,
	nowMs,
}: {
	phases: { startsAt: number | null }[];
	nowMs: number;
}) => {
	const startsAt = phases[0]?.startsAt;
	return startsAt != null && isAfter(startsAt, nowMs);
};

/** The first phase is set to start before now, so it backdates. */
export const firstPhaseIsBackdated = ({
	phases,
	nowMs,
}: {
	phases: { startsAt: number | null }[];
	nowMs: number;
}) => {
	const startsAt = phases[0]?.startsAt;
	return startsAt != null && isBefore(startsAt, nowMs);
};

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d, yyyy");
