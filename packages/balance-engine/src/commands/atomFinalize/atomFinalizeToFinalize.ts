import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { FinalizeCommand } from "../finalize/types/finalizeCommand.js";
import { lockFeatureOf } from "./lockFeatureOf.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/** Decided on the Atom, a draw above the lock overflows rather than leaving the lock open behind the Atom's 200; undecided, the row's own overage governs. */
const lockTermsOf = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): WorkerLock =>
	command.featureId === null ? lock : { ...lock, overage_behavior: "overflow" };

/** The finalize the API would send for this row: its identity from the row, the settlement from the Atom. */
export const atomFinalizeToFinalize = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): FinalizeCommand => {
	const feature = lockFeatureOf({ command, lock });
	if (!feature)
		throw new UnsupportedCommandError({ reason: "feature_not_found" });
	return {
		schemaVersion: 1,
		type: "finalize",
		requestId: command.requestId,
		commandId: command.commandId,
		occurredAt: command.occurredAt,
		identity: {
			...command.identity,
			customerId: lock.customer_id,
			entityId: lock.entity_id,
		},
		org: command.org,
		lock: lockTermsOf({ command, lock }),
		internalFeatureId: feature.internalFeatureId,
		finalValue: command.finalValue,
		properties: command.properties,
	};
};
