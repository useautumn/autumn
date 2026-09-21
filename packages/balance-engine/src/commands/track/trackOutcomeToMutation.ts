import { deltasToUsageEventFields } from "../../common/usageEvent/deltasToUsageEventFields.js";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import { fundingRowOf } from "../../deduction/utils/fundingRowOf.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import { trackLockToRowChange } from "./trackLockToRowChange.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** Wraps what the deduction decided into the one mutation: command, changes, result. */
export const trackOutcomeToMutation = ({
	command,
	outcome,
	fullSubject,
}: {
	command: TrackCommand;
	outcome: DeductionOutcome;
	fullSubject: WorkerFullSubject;
}): SubjectStateMutation => {
	const { rejected, changes } = outcome;
	const revisionBefore = fullSubject.revision;
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
	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			subject: fullSubjectToMutationSubject({ fullSubject }),
			revision: { before: revisionBefore, after: revisionBefore + 1 },
			command,
			changes: [...changes, ...lockChanges],
			result: {
				type: "track",
				status: rejected ? "rejected" : "applied",
				reason: rejected ? "insufficient_balance" : null,
				deltas: rejected ? [] : outcome.deltas,
				...deltasToUsageEventFields({
					fullSubject,
					deltas: rejected ? [] : outcome.deltas,
				}),
				fundingFeatureId: fundingRow?.featureId ?? command.featureId,
				fundingCreditCost: fundingRow?.creditCost ?? 1,
			},
		},
	});
};
