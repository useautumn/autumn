import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

export type LockFeature = { featureId: string; internalFeatureId: string };

/** The lock's feature: as the Atom named it when it decided, else as Autumn's own row names it; null when neither does. */
export const lockFeatureOf = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): LockFeature | null => {
	if (command.featureId !== null && command.internalFeatureId !== null)
		return {
			featureId: command.featureId,
			internalFeatureId: command.internalFeatureId,
		};
	if (lock?.internal_feature_id)
		return {
			featureId: lock.feature_id,
			internalFeatureId: lock.internal_feature_id,
		};
	return null;
};
