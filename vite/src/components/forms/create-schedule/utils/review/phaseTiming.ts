import { format } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d");

/** "Now" for the immediate phase, otherwise the phase's start date. */
export const phaseLabel = ({
	phaseIndex,
	startsAt,
}: {
	phaseIndex: number;
	startsAt: number;
}) =>
	isImmediatePhase({ phaseIndex }) ? "Now" : formatPhaseDate({ startsAt });

export const joinDetail = (parts: (string | undefined)[]) => {
	const present = parts.filter((part): part is string => !!part);
	return present.length > 0 ? present.join(" · ") : undefined;
};

export const summarizeCounts = ({
	counts,
	emptyLabel,
}: {
	counts: [label: string, count: number][];
	emptyLabel: string;
}) => {
	const parts = counts
		.filter(([, count]) => count > 0)
		.map(([label, count]) => `${count} ${label}`);
	return parts.length > 0 ? parts.join(" · ") : emptyLabel;
};

export const withoutEmptyPhases = <Phase extends { rows: unknown[] }>(
	phases: Phase[],
) => phases.filter((phase) => phase.rows.length > 0);
