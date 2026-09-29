import { format } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d, yyyy");
