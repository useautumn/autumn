import {
	type ApplyBillingPlanCommand,
	planCommandToEntityIdentities,
	planInsertedEntities,
	planInsertsCustomer,
} from "@autumn/balance-engine";
import { SubjectNotFoundError } from "../../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import { ensureCustomerToCreate } from "./ensureCustomerToCreate.js";

/** The customer and every named entity resident before the decision; an entity the plan creates is absent unless it already exists. */
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

	for (const identity of planCommandToEntityIdentities({ command })) {
		const created = createdEntityIds.has(identity.entityId);
		try {
			await subjectHydrator.ensure({ identity });
		} catch (cause) {
			if (!created || !(cause instanceof SubjectNotFoundError)) throw cause;
		}
	}
};
