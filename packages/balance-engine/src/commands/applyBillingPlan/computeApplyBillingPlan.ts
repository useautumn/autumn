import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";
import type { WorkerEntity } from "../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import { assertInsertsHaveNamedOwners } from "./assertInsertsHaveNamedOwners.js";
import { opToRowChanges } from "./opToRowChanges/opToRowChanges.js";
import type { PlanRowChangeContext } from "./opToRowChanges/planRowChangeContext.js";
import type { ApplyBillingPlanCommand } from "./types/applyBillingPlanCommand.js";

/** The customer row a plan creates the subject with, if it creates one. */
export const planInsertedCustomer = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): WorkerCustomer | null => {
	const [customer] = command.ops.flatMap((op) =>
		op.op === "insert" && op.table === "customer" ? [op.row] : [],
	);
	return customer ?? null;
};

/** A plan that inserts the customer creates the subject, so it applies only where none exists. */
export const planInsertsCustomer = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): boolean => planInsertedCustomer({ command }) !== null;

/** The entities a plan creates: named on the command like any other, but not yet held anywhere. */
export const planInsertedEntities = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): WorkerEntity[] =>
	command.ops.flatMap((op) =>
		op.op === "insert" && op.table === "entity" ? [op.row] : [],
	);

/** The plan's ops as one mutation over the customer and the entities it names, in op order. */
export const computeApplyBillingPlan = ({
	command,
	state,
	entities = [],
}: {
	command: ApplyBillingPlanCommand;
	/** The customer's state with the named entities' rows merged in. */
	state: SubjectState | null;
	entities?: readonly WorkerEntity[];
}): SubjectStateMutation => {
	assertInsertsHaveNamedOwners({ command, state, entities });
	const context: PlanRowChangeContext = { state, deletedRowKeys: new Set() };
	const revisionBefore = state?.revision ?? 0;
	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: revisionBefore, after: revisionBefore + 1 },
			command,
			changes: command.ops.flatMap((op) => opToRowChanges({ op, context })),
			result: { type: "applyBillingPlan" },
		},
	});
};
