import type { RowChange } from "../../models/mutation/rowChange.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import type { ApplyBillingPlanCommand } from "./types/applyBillingPlanCommand.js";

/** The plan as one mutation carrying these changes; the revision moves by one. */
export const toPlanMutation = ({
	command,
	state,
	changes,
}: {
	command: ApplyBillingPlanCommand;
	state: SubjectState | null;
	changes: RowChange[];
}): SubjectStateMutation => {
	const revisionBefore = state?.revision ?? 0;
	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: revisionBefore, after: revisionBefore + 1 },
			command,
			changes,
			result: { type: "applyBillingPlan" },
		},
	});
};
