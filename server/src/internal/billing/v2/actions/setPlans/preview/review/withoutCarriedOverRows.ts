import type { ReviewPlanRow } from "./types/reviewPhase";

const rowSignature = (row: ReviewPlanRow) => {
	const key = "after" in row ? row.after.segment.key : row.before.segment.key;
	const before = "before" in row ? row.before.segment.configHash : null;
	const after = "after" in row ? row.after.segment.configHash : null;
	return JSON.stringify([key, row.status, before, after]);
};

/** A later phase drops a row the phase before it already shows: that change carries over, it isn't new. */
export const withoutCarriedOverRows = <Phase extends { rows: ReviewPlanRow[] }>(
	phases: Phase[],
): Phase[] =>
	phases.map((phase, phaseIndex) => {
		const previousPhase = phases[phaseIndex - 1];
		if (!previousPhase) return phase;

		const previousSignatures = new Set(previousPhase.rows.map(rowSignature));
		return {
			...phase,
			rows: phase.rows.filter(
				(row) => !previousSignatures.has(rowSignature(row)),
			),
		};
	});
