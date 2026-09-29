import { FIRST_PHASE_TOLERANCE_MS } from "../errors/handleFirstPhaseStartDateErrors";
import type { normalizeSetPlansPhases } from "../errors/normalizeSetPlansPhases";

/** The last phase that has already started, within the first-phase tolerance. */
export const getCurrentSetPlansPhaseIndex = ({
	phases,
	currentEpochMs,
}: {
	phases: ReturnType<typeof normalizeSetPlansPhases>;
	currentEpochMs: number;
}) => {
	let currentPhaseIndex = 0;

	for (let index = 0; index < phases.length; index++) {
		const phase = phases[index];
		if (!phase || phase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS) {
			break;
		}
		currentPhaseIndex = index;
	}

	return currentPhaseIndex;
};
