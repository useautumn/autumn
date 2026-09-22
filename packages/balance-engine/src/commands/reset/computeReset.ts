import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import { fullSubjectToDueRows } from "../../utils/subjectUtils/fullSubjectToDueRows.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { customerEntitlementToResetChanges } from "./customerEntitlementToResetChanges.js";
import type { ResetCommand } from "./types/resetCommand.js";

/** Refills every row due by `occurredAt` in one mutation; null when nothing is due, so nothing is written. */
export const computeReset = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: ResetCommand;
}): SubjectStateMutation | null => {
	assertCommandSupported({ fullSubject, command });
	const asOf = command.occurredAt;
	const dueRows = fullSubjectToDueRows({ fullSubject, asOf });
	if (dueRows.length === 0) return null;

	const resets = dueRows.map((row) =>
		customerEntitlementToResetChanges({ row, command }),
	);
	return parseSubjectStateMutation({
		input: {
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
			changes: resets.flatMap((reset) => reset.changes),
			result: { type: "reset", rows: resets.map((reset) => reset.row) },
		},
	});
};
