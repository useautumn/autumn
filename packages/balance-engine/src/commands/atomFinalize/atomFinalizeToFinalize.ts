import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { FinalizeCommand } from "../finalize/types/finalizeCommand.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/** The finalize the API would send for this row: its identity from the row, the settlement from the Atom. */
export const atomFinalizeToFinalize = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): FinalizeCommand => {
	if (command.internalFeatureId === null)
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
		// Decided on the Atom, a draw above the lock overflows rather than leaving the lock open behind the Atom's 200;
		// left undecided, the row's own overage governs, as it does for the API's finalize.
		lock:
			command.featureId === null
				? lock
				: { ...lock, overage_behavior: "overflow" },
		internalFeatureId: command.internalFeatureId,
		finalValue: command.finalValue,
		properties: command.properties,
	};
};
