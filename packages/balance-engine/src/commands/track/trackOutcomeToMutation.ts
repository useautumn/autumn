import { deltasToUsageEventFields } from "../../common/usageEvent/deltasToUsageEventFields.js";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import { fundingRowOf } from "../../deduction/utils/fundingRowOf.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { trackLockToRowChange } from "./trackLockToRowChange.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** Wraps what the deduction decided into the one mutation: command, changes, result. */
export const trackOutcomeToMutation = ({
	command,
	outcome,
	fullSubject,
	revision,
	lean = false,
}: {
	command: TrackCommand;
	outcome: DeductionOutcome;
	fullSubject: WorkerFullSubject;
	/** The revision the mutation applies to. */
	revision: number;
	lean?: boolean;
}): SubjectStateMutation => {
	const { rejected, changes } = outcome;
	const revisionBefore = revision;
	const fundingRow = fundingRowOf({ outcome });
	// A rejected track deducted nothing, so there is nothing for a lock to hold.
	const lockChanges =
		command.lock && !rejected
			? [
					trackLockToRowChange({
						lock: command.lock,
						command,
						fullSubject,
						outcome,
					}),
				]
			: [];
	return {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		subject: fullSubjectToMutationSubject({ fullSubject }),
		revision: { before: revisionBefore, after: revisionBefore + 1 },
		command,
		changes:
			lean && lockChanges.length === 0 ? changes : [...changes, ...lockChanges],
		result: {
			type: "track",
			status: rejected ? "rejected" : "applied",
			reason: rejected ? "insufficient_balance" : null,
			deltas: rejected ? [] : outcome.deltas,
			...deltasToUsageEventFields({
				fullSubject,
				deltas: rejected ? [] : outcome.deltas,
				lean,
			}),
			fundingFeatureId: fundingRow?.featureId ?? command.featureId,
			fundingCreditCost: fundingRow?.creditCost ?? 1,
		},
	};
};
