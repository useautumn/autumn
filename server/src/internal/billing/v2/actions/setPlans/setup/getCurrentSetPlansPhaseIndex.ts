import { SET_PLANS_FIRST_PHASE_TOLERANCE_MS } from "@autumn/shared";
import type { normalizeSetPlansPhases } from "../errors/normalizeSetPlansPhases";

export const getCurrentSetPlansPhaseIndex = ({
	phases,
	currentEpochMs,
}: {
	phases: ReturnType<typeof normalizeSetPlansPhases>;
	currentEpochMs: number;
}) => {
	const startedPhaseCount = phases.filter(
		(phase) =>
			phase.starts_at <= currentEpochMs + SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
	).length;

	return Math.max(0, startedPhaseCount - 1);
};
