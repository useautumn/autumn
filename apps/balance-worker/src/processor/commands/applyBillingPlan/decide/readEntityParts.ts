import {
	type ApplyBillingPlanCommand,
	type BillingPlanEntityPart,
	type MeteringIdentity,
	planCommandToEntityIdentities,
	planInsertedEntities,
	type SubjectState,
	splitSubjectState,
	type WorkerEntity,
} from "@autumn/balance-engine";
import { SubjectNotFoundError } from "../../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";

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

/** Each named entity as the writer holds it now; the engine builds the parts of ones the plan creates, unless one is already held: it exists. */
export const readEntityParts = ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): { parts: BillingPlanEntityPart[]; existing?: WorkerEntity } => {
	const createdIds = new Set(
		planInsertedEntities({ command }).map(({ id }) => id),
	);
	const parts: BillingPlanEntityPart[] = [];
	for (const identity of planCommandToEntityIdentities({ command })) {
		const own = readOwnEntityState({ scope, identity });
		if (createdIds.has(identity.entityId)) {
			if (own?.entity) return { parts, existing: own.entity };
			continue;
		}
		if (!own?.entity) throw new SubjectNotFoundError({ identity });
		parts.push({ state: own, entity: own.entity });
	}
	return { parts };
};
