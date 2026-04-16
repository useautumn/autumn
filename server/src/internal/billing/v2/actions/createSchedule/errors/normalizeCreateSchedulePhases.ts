import { type CreateScheduleParamsV0, ms, RecaseError } from "@autumn/shared";

const FIRST_PHASE_TOLERANCE_MS = ms.minutes(1);
type CreateSchedulePhase = CreateScheduleParamsV0["phases"][number];

/** Sort phases and enforce the supported create_schedule shape. */
export const normalizeCreateSchedulePhases = ({
	currentEpochMs,
	phases,
}: {
	currentEpochMs: number;
	phases: CreateScheduleParamsV0["phases"];
}): [CreateSchedulePhase, ...CreateSchedulePhase[]] => {
	const sortedPhases = [...phases].sort((a, b) => a.starts_at - b.starts_at);
	const [firstPhase] = sortedPhases;

	if (!firstPhase) {
		throw new RecaseError({
			message: "At least one phase must be provided",
			statusCode: 400,
		});
	}

	for (const phase of sortedPhases) {
		if (phase.plans.length === 0) {
			throw new RecaseError({
				message: "Each phase must include at least one plan",
				statusCode: 400,
			});
		}
	}

	for (let i = 1; i < sortedPhases.length; i++) {
		const previousPhase = sortedPhases[i - 1];
		const currentPhase = sortedPhases[i];

		if (previousPhase && currentPhase?.starts_at <= previousPhase.starts_at) {
			throw new RecaseError({
				message: "Phase starts_at values must be strictly increasing",
				statusCode: 400,
			});
		}
	}

	if (
		firstPhase.starts_at < currentEpochMs - FIRST_PHASE_TOLERANCE_MS ||
		firstPhase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS
	) {
		throw new RecaseError({
			message: "The first phase must start immediately",
			statusCode: 400,
		});
	}

	return sortedPhases as [CreateSchedulePhase, ...CreateSchedulePhase[]];
};
