import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerEntity } from "../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { applyMutation } from "../../mutation/applyMutation.js";
import {
	mergeCustomerAndEntities,
	splitCustomerAndEntities,
} from "../../utils/subjectStateUtils/convertSubjectStateUtils.js";
import { createSubjectState } from "../../utils/subjectStateUtils/createSubjectState.js";
import {
	computeApplyBillingPlan,
	planInsertedEntities,
} from "./computeApplyBillingPlan.js";
import type { ApplyBillingPlanCommand } from "./types/applyBillingPlanCommand.js";

/** An entity the plan names, as the worker holds it: its own rows, and its row. */
export type BillingPlanEntityPart = {
	state: SubjectState;
	entity: WorkerEntity;
};

/** An entity the plan creates starts with no rows, under its own identity. */
const createdEntityParts = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): BillingPlanEntityPart[] =>
	planInsertedEntities({ command }).flatMap((entity) =>
		entity.id && command.entityIds.includes(entity.id)
			? [
					{
						state: createSubjectState({
							identity: { ...command.identity, entityId: entity.id },
							entity,
						}),
						entity,
					},
				]
			: [],
	);

/** The plan as one mutation over the customer and the entities it names, and what each owner holds after it. */
export const applyBillingPlanToSubjects = ({
	command,
	customer,
	entityParts,
}: {
	command: ApplyBillingPlanCommand;
	/** Null when the plan creates the customer. */
	customer: SubjectState | null;
	/** The named entities that already exist; the ones the plan creates are added here. */
	entityParts: readonly BillingPlanEntityPart[];
}): {
	mutation: SubjectStateMutation;
	nextState: SubjectState;
	/** The customer's part first, then each entity's. */
	projectedStates: SubjectState[];
} => {
	const parts = [...entityParts, ...createdEntityParts({ command })];
	const entities = parts.map(({ entity }) => entity);
	const view = customer
		? mergeCustomerAndEntities({
				customer,
				entities: parts.map(({ state }) => state),
			})
		: null;
	const mutation = computeApplyBillingPlan({ command, state: view, entities });
	const nextState = applyMutation({ state: view, mutation });
	const owners = splitCustomerAndEntities({ state: nextState, entities });
	return {
		mutation,
		nextState,
		projectedStates: [owners.customer, ...owners.entities],
	};
};
