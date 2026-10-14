import type { SetPlansPreviewPhase } from "@autumn/shared";
import { formatPhaseDate } from "../schedulePhaseTiming";

export const phaseLabel = ({ phase }: { phase: SetPlansPreviewPhase }) =>
	phase.starts_now ? "Now" : formatPhaseDate({ startsAt: phase.starts_at });

export const phaseSummaryLabel = ({
	phase,
}: {
	phase: SetPlansPreviewPhase;
}) =>
	phase.starts_now
		? "now"
		: `on ${formatPhaseDate({ startsAt: phase.starts_at })}`;
