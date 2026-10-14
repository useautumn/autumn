import type { Catalog } from "../../models/catalog/catalog.js";
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

export type BillingPlanEntityPart = {
	state: SubjectState;
	entity: WorkerEntity;
};

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

export const applyBillingPlanToSubjects = ({
	command,
	customer,
	entityParts,
	catalog,
}: {
	command: ApplyBillingPlanCommand;
	customer: SubjectState | null;
	entityParts: readonly BillingPlanEntityPart[];
	catalog?: Catalog;
}): {
	mutation: SubjectStateMutation;
	nextState: SubjectState;
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
	const mutation = computeApplyBillingPlan({
		command,
		state: view,
		entities,
		catalog,
	});
	const nextState = applyMutation({ state: view, mutation });
	const owners = splitCustomerAndEntities({ state: nextState, entities });
	return {
		mutation,
		nextState,
		projectedStates: [owners.customer, ...owners.entities],
	};
};
