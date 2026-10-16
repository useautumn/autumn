import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/**
 * An undecided finalize names no entity: once Autumn's row is found it is decided on that row's entity, as the API's
 * finalize is, so an entity's lock settles on the entity's rows. A decided one names its entity already.
 */
export const atomFinalizeOnLockEntity = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): AtomFinalizeCommand =>
	command.featureId === null && lock
		? {
				...command,
				identity: { ...command.identity, entityId: lock.entity_id },
			}
		: command;
