import type { Catalog } from "../../models/catalog/catalog.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";
import type { WorkerEntity } from "../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { applyCorePlan } from "./applyCorePlan.js";
import { applyPlanRebalances } from "./applyPlanRebalances/applyPlanRebalances.js";
import { assertInsertsHaveNamedOwners } from "./assertInsertsHaveNamedOwners.js";
import { toPlanMutation } from "./toPlanMutation.js";
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

/** The plan's ops as one mutation over the customer and the entities it names: its core plan applied, then its rebalances on the result. */
export const computeApplyBillingPlan = ({
	command,
	state,
	entities = [],
	catalog,
}: {
	command: ApplyBillingPlanCommand;
	/** The customer's state with the named entities' rows merged in. */
	state: SubjectState | null;
	entities?: readonly WorkerEntity[];
	/** The rows the plan's state and inserts join to; a rebalance reads them. */
	catalog?: Catalog;
}): SubjectStateMutation => {
	assertInsertsHaveNamedOwners({ command, state, entities });
	const corePlan = applyCorePlan({ command, state });
	const rebalances = applyPlanRebalances({
		command,
		state: corePlan.state,
		entities,
		catalog,
	});
	return toPlanMutation({
		command,
		state,
		changes: [...corePlan.changes, ...rebalances.changes],
	});
};
