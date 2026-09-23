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

const entityIdentitiesOf = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): MeteringIdentity[] =>
	command.entityIds.map((entityId) => ({ ...command.identity, entityId }));

/** A plan that creates the customer runs where none exists; every other subject it names must be resident. */
export const ensurePlanSubjects = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): Promise<void> => {
	const { subjectHydrator } = scope.ctx;
	try {
		await subjectHydrator.ensure({ identity: command.identity });
	} catch (error) {
		const creatingCustomer =
			error instanceof SubjectNotFoundError && planInsertsCustomer({ command });
		if (!creatingCustomer) throw error;
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
