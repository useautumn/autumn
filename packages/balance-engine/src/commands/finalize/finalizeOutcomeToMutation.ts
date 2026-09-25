import { deltasToUsageEventFields } from "../../common/usageEvent/deltasToUsageEventFields.js";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { finalizeCommandToValues } from "./deductFinalize.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";

/** Wraps what the settlement decided into the one mutation: the lock's deltas and its removal. */
export const finalizeOutcomeToMutation = ({
	command,
	outcome,
	fullSubject,
}: {
	command: FinalizeCommand;
	outcome: DeductionOutcome;
	fullSubject: WorkerFullSubject;
}): SubjectStateMutation => {
	const { rejected } = outcome;
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
		// A rejected confirm moves nothing and leaves the lock open for another attempt.
		changes: rejected
			? []
			: [
					...outcome.changes,
					{ table: "locks", op: "delete", id: command.lock.id },
				],
		result: {
			type: "finalize",
			status: rejected ? "rejected" : "applied",
			reason: rejected ? "insufficient_balance" : null,
			...finalizeCommandToValues({ command }),
			deltas: rejected ? [] : outcome.deltas,
			...deltasToUsageEventFields({
				fullSubject,
				deltas: rejected ? [] : outcome.deltas,
			}),
		},
	};
};
