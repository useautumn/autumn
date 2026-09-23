import {
	type ApplyBillingPlanCommand,
	type BillingPlanEntityPart,
	type MeteringIdentity,
	planInsertedEntities,
	planInsertsCustomer,
	StaleMutationError,
	type SubjectState,
	splitSubjectState,
} from "@autumn/balance-engine";
import { SubjectNotFoundError } from "../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import { ensureCustomerToCreate } from "./createCustomer/ensureCustomerToCreate.js";

const entityIdentitiesOf = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): MeteringIdentity[] =>
	command.entityIds.map((entityId) => ({ ...command.identity, entityId }));

/** The customer, and every entity the plan names but does not create, resident before the decision. */
export const ensurePlanSubjects = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): Promise<void> => {
	const { subjectHydrator } = scope.ctx;

	if (planInsertsCustomer({ command })) {
		await ensureCustomerToCreate({ scope, command });
	} else {
		await subjectHydrator.ensure({ identity: command.identity });
	}

	const createdEntityIds = new Set(
		planInsertedEntities({ command }).map(({ id }) => id),
	);

	for (const identity of entityIdentitiesOf({ command }))
		if (!createdEntityIds.has(identity.entityId))
			await subjectHydrator.ensure({ identity });
};

const readOwnEntityState = ({
	scope,
	identity,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
}): SubjectState | null => {
	const merged = scope.ctx.writer.readFreshestState({ identity });
	return merged ? splitSubjectState({ state: merged }).entity : null;
};

/** Each named entity that already exists, as the writer holds it now; the engine builds the parts of ones the plan creates. */
export const readEntityParts = ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): BillingPlanEntityPart[] => {
	const createdEntities = planInsertedEntities({ command });
	return entityIdentitiesOf({ command }).flatMap((identity) => {
		const own = readOwnEntityState({ scope, identity });
		const created = createdEntities.find(({ id }) => id === identity.entityId);
		if (created) {
			// Already held means it already exists: the worker's copy of the customer is behind.
			if (own?.entity)
				throw new StaleMutationError({ subject: created.id ?? "" });
			return [];
		}
		if (!own?.entity) throw new SubjectNotFoundError({ identity });
		return [{ state: own, entity: own.entity }];
	});
};
