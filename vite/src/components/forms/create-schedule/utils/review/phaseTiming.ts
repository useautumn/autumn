import { format, subMinutes } from "date-fns";

const IMMEDIATE_PHASE_INDEX = 0;
const BACKDATE_TOLERANCE_MINUTES = 1;
const NOW_LABEL = "Now";

export const isImmediatePhase = ({ phaseIndex }: { phaseIndex: number }) =>
	phaseIndex === IMMEDIATE_PHASE_INDEX;

export const formatPhaseDate = ({ startsAt }: { startsAt: number }) =>
	format(startsAt, "MMM d, yyyy");

/** The immediate phase starts now unless it was backdated before the form opened. */
export const startsNow = ({
	phaseIndex,
	startsAt,
	nowMs,
}: {
	phaseIndex: number;
	startsAt: number;
	nowMs: number;
}) =>
	isImmediatePhase({ phaseIndex }) &&
	startsAt >= subMinutes(nowMs, BACKDATE_TOLERANCE_MINUTES).getTime();

export const phaseLabel = ({
	phaseIndex,
	startsAt,
	nowMs,
}: {
	phaseIndex: number;
	startsAt: number;
	nowMs: number;
}) =>
	startsNow({ phaseIndex, startsAt, nowMs })
		? NOW_LABEL
		: formatPhaseDate({ startsAt });

/** "now" or "on Nov 1, 2026", for section summaries. */
export const phaseSummaryLabel = ({
	phaseIndex,
	startsAt,
	nowMs,
}: {
	phaseIndex: number;
	startsAt: number;
	nowMs: number;
}) =>
	startsNow({ phaseIndex, startsAt, nowMs })
		? "now"
		: `on ${formatPhaseDate({ startsAt })}`;

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
