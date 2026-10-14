import { withoutRepeatsOfPreviousPhase } from "../withoutRepeatsOfPreviousPhase";
import type { ReviewPlanRow } from "./types/reviewPhase";

const rowSignature = (row: ReviewPlanRow) => {
	const key = "after" in row ? row.after.segment.key : row.before.segment.key;
	const before = "before" in row ? row.before.segment.configHash : null;
	const after = "after" in row ? row.after.segment.configHash : null;
	return JSON.stringify([key, row.status, before, after]);
};

export const withoutCarriedOverRows = <Phase extends { rows: ReviewPlanRow[] }>(
	phases: Phase[],
): Phase[] => {
	const phaseRows = withoutRepeatsOfPreviousPhase({
		phases: phases.map(({ rows }) => rows),
		signature: rowSignature,
	});
	return phases.map((phase, phaseIndex) => ({
		...phase,
		rows: phaseRows[phaseIndex],
	}));
};
