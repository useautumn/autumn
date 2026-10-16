import { LockFeatureNotLoadedError } from "../../errors.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

export type LockFeature = { featureId: string; internalFeatureId: string };

/**
 * The lock's feature: as the Atom named it when it decided, else as Autumn's own row names it; null when neither does.
 * A row read back without its feature's internal id (its feature row gone) can settle nothing: the record is retried.
 */
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
	if (!lock) return null;
	if (!lock.internal_feature_id)
		throw new LockFeatureNotLoadedError({
			lockId: lock.lock_id,
			featureId: lock.feature_id,
		});
	return {
		featureId: lock.feature_id,
		internalFeatureId: lock.internal_feature_id,
	};
};
