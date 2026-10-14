import { Decimal } from "decimal.js";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { AtomSource } from "../../models/command/atomSource.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { atomSourceToRowChange } from "../common/atomSourceToRowChange.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";

/** A finalize that settles nothing: the lock, if Autumn still holds it, stays as it is, and only the Atom's seq can land. */
export const finalizeOfNothing = ({
	command,
	lock,
	source,
	fullSubject,
}: {
	command: FinalizeCommand;
	/** The lock Autumn still holds, when it does. */
	lock: WorkerLock | null;
	source: AtomSource;
	fullSubject: WorkerFullSubject;
}): SubjectStateMutation => {
	const sourceChange = atomSourceToRowChange({
		source,
		customer: fullSubject.customer,
	});
	const lockValue = (lock?.deltas ?? [])
		.reduce((total, delta) => total.minus(delta.valueDelta), new Decimal(0))
		.toNumber();
	return {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		subject: fullSubjectToMutationSubject({ fullSubject }),
		revision: {
			before: fullSubject.revision,
			after: fullSubject.revision + 1,
		},
		command,
		changes: sourceChange ? [sourceChange] : [],
		// Settled at what the lock took: no difference, so no usage event.
		result: {
			type: "finalize",
			status: "applied",
			reason: null,
			lockValue,
			finalValue: lockValue,
			deltas: [],
			deductions: [],
			internalProductId: null,
		},
	};
};
