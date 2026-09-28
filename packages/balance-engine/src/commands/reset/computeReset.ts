import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { fullSubjectToDueRows } from "../../utils/subjectUtils/fullSubjectToDueRows.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { customerEntitlementToResetChanges } from "./customerEntitlementToResetChanges.js";
import type { ResetCommand } from "./types/resetCommand.js";
import { usageWindowRollChanges } from "./usageWindowRollChanges.js";

/** Refills every row due by `occurredAt` and rolls the counters it moves, in one mutation; null when nothing changes. */
export const computeReset = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: ResetCommand;
}): SubjectStateMutation | null => {
	assertCommandSupported({ fullSubject, command });
	const asOf = command.occurredAt;
	const resets = fullSubjectToDueRows({ fullSubject, asOf }).map((row) =>
		customerEntitlementToResetChanges({ row, command }),
	);
	const refilledRows = resets.map((reset) => reset.row);
	const rollChanges = usageWindowRollChanges({
		fullSubject,
		command,
		refilledRows,
	});
	if (resets.length === 0 && rollChanges.length === 0) return null;
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
		changes: [...resets.flatMap((reset) => reset.changes), ...rollChanges],
		result: { type: "reset", rows: refilledRows },
	};
};
