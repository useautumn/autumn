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
}): FinalizeCommand => ({
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
	lock,
	internalFeatureId: command.internalFeatureId,
	finalValue: command.finalValue,
	properties: command.properties,
});
