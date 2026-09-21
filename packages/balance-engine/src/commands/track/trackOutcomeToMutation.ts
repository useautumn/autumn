import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import { fundingRowOf } from "../../deduction/utils/fundingRowOf.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** Wraps what the deduction decided into the one mutation: command, changes, result. */
export const trackOutcomeToMutation = ({
	command,
	outcome,
	revisionBefore,
}: {
	command: TrackCommand;
	outcome: DeductionOutcome;
	revisionBefore: number;
}): SubjectStateMutation => {
	const { rejected, changes } = outcome;
	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: revisionBefore, after: revisionBefore + 1 },
			command,
			changes,
			result: {
				type: "track",
				status: rejected ? "rejected" : "applied",
				reason: rejected ? "insufficient_balance" : null,
				deltas: rejected ? [] : outcome.deltas,
				fundingFeatureId:
					fundingRowOf({ outcome })?.featureId ?? command.featureId,
			},
		},
	});
};
