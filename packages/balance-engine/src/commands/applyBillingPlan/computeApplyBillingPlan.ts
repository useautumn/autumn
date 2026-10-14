import type { Catalog } from "../../models/catalog/catalog.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";
import type { WorkerEntity } from "../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { applyCorePlan } from "./applyCorePlan.js";
import { applyPlanRebalances } from "./applyPlanRebalances/applyPlanRebalances.js";
import { applyPlanRollovers } from "./applyPlanRollovers/applyPlanRollovers.js";
import { assertInsertsHaveNamedOwners } from "./assertInsertsHaveNamedOwners.js";
import { toPlanMutation } from "./toPlanMutation.js";
import type { ApplyBillingPlanCommand } from "./types/applyBillingPlanCommand.js";

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

export const planInsertsCustomer = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): boolean => planInsertedCustomer({ command }) !== null;

export const planInsertedEntities = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): WorkerEntity[] =>
	command.ops.flatMap((op) =>
		op.op === "insert" && op.table === "entity" ? [op.row] : [],
	);

export const computeApplyBillingPlan = ({
	command,
	state,
	entities = [],
	catalog,
}: {
	command: ApplyBillingPlanCommand;
	state: SubjectState | null;
	entities?: readonly WorkerEntity[];
	catalog?: Catalog;
}): SubjectStateMutation => {
	assertInsertsHaveNamedOwners({ command, state, entities });
	const corePlan = applyCorePlan({ command, state });
	const rollovers = applyPlanRollovers({
		command,
		state: corePlan.state,
		entities,
		catalog,
	});
	const rebalances = applyPlanRebalances({
		command,
		state: rollovers.state,
		entities,
		catalog,
	});
	return toPlanMutation({
		command,
		state,
		changes: [...corePlan.changes, ...rollovers.changes, ...rebalances.changes],
	});
};
