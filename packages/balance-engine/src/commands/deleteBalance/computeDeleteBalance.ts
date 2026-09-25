import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { selectBalanceRows } from "../common/selectBalanceRows.js";
import { assertBalancesDeletable } from "./deleteBalanceGuards.js";
import { deleteRows, markProductsCustom } from "./steps/deleteRows.js";
import { recalculateUsage } from "./steps/recalculateUsage.js";
import type { DeleteBalanceCommand } from "./types/deleteBalanceCommand.js";

/** The matching grants removed in one mutation, their usage kept when asked. */
export const computeDeleteBalance = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: DeleteBalanceCommand;
}): SubjectStateMutation => {
	assertCommandSupported({ fullSubject, command });
	const customerEntitlements = selectBalanceRows({
		fullSubject,
		featureId: command.featureId,
		customerEntitlementFilters: command.customerEntitlementFilters,
		now: command.occurredAt,
	});
	assertBalancesDeletable({ customerEntitlements });

	const recalculation = command.recalculate
		? recalculateUsage({
				fullSubject,
				command,
				deletedRows: customerEntitlements,
			})
		: { changes: [], overageCarrierId: null };
	const deleted = customerEntitlements.filter(
		({ id }) => id !== recalculation.overageCarrierId,
	);

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
		changes: [
			...deleteRows({ customerEntitlements: deleted }),
			...markProductsCustom({ customerEntitlements }),
			...recalculation.changes,
		],
		result: {
			type: "deleteBalance",
			deletedIds: deleted.map(({ id }) => id),
			overageCarrierId: recalculation.overageCarrierId,
		},
	};
};
