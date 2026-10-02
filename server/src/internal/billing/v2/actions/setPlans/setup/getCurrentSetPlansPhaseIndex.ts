import type { normalizeSetPlansPhases } from "../errors/normalizeSetPlansPhases";
import { FIRST_PHASE_TOLERANCE_MS } from "./classifyFirstPhaseStart";

export const getCurrentSetPlansPhaseIndex = ({
	phases,
	currentEpochMs,
}: {
	phases: ReturnType<typeof normalizeSetPlansPhases>;
	currentEpochMs: number;
}) => {
	const startedPhaseCount = phases.filter(
		(phase) => phase.starts_at <= currentEpochMs + FIRST_PHASE_TOLERANCE_MS,
	).length;

	return Math.max(0, startedPhaseCount - 1);
};
