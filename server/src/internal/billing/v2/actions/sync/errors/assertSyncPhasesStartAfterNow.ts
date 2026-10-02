import { ErrCode, RecaseError, type SyncParamsV1 } from "@autumn/shared";

/** A phase after the one starting now must start later, or the live phase would end before it starts. */
export const assertSyncPhasesStartAfterNow = ({
	phases,
	currentEpochMs,
}: {
	phases: NonNullable<SyncParamsV1["phases"]>;
	currentEpochMs: number;
}): void => {
	const [firstPhase, ...laterPhases] = phases;
	if (firstPhase?.starts_at !== "now") return;

	const hasStalePhase = laterPhases.some(
		(phase) => phase.starts_at !== "now" && phase.starts_at <= currentEpochMs,
	);
	if (!hasStalePhase) return;

	throw new RecaseError({
		message:
			"phases after the 'now' phase must start in the future; refresh the proposal and retry",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
