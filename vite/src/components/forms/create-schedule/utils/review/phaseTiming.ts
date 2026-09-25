import { format } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d");

/** "now" for the immediate phase, otherwise the phase's start date. */
export const formatPhaseTiming = ({
	phaseIndex,
	startsAt,
}: {
	phaseIndex: number;
	startsAt: number;
}) =>
	isImmediatePhase({ phaseIndex }) ? "now" : formatPhaseDate({ startsAt });

/** Detail prefix that places a future-phase row on the timeline. */
export const futurePhasePrefix = ({
	phaseIndex,
	startsAt,
}: {
	phaseIndex: number;
	startsAt: number;
}) =>
	isImmediatePhase({ phaseIndex })
		? undefined
		: `From ${formatPhaseDate({ startsAt })}`;

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
