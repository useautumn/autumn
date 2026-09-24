import {
	type ApplyBillingPlanCommand,
	applyBillingPlanToSubjects,
	meteringIdentityToPartitionKey,
	planInsertsCustomer,
	StaleMutationError,
	type SubjectState,
} from "@autumn/balance-engine";
import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import { dropStaleSubject } from "../../../actions/dropStaleSubject.js";
import { PartitionProcessorStateNotFoundError } from "../../../common/processorErrors.js";
import { SubjectStaleError } from "../../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import type { MutationResult } from "../../../writer/types/mutation.js";
import { readEntityParts } from "./readEntityParts.js";

/** Runs inside the writer's critical section: no await, no I/O. */
const decideApplyBillingPlan = ({
	scope,
	state,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	command: ApplyBillingPlanCommand;
}): MutationResult<ApplyBillingPlanReply> => {
	const { subjectHydrator } = scope.ctx;
	const createsCustomer = planInsertsCustomer({ command });
	if (state && createsCustomer)
		return {
			kind: "reply",
			reply: {
				result: { status: "customer_exists" },
				state,
				catalog: subjectHydrator.readCatalog({ state }),
			},
		};
	if (!state && !createsCustomer)
		throw new PartitionProcessorStateNotFoundError({
			customerKey: meteringIdentityToPartitionKey({
				identity: command.identity,
			}),
		});

	const { parts, existing } = readEntityParts({ scope, command });
	if (existing && state)
		return {
			kind: "reply",
			reply: {
				result: {
					status: "entity_exists",
					entity: { id: existing.id ?? "", internal_id: existing.internal_id },
				},
				state,
				catalog: subjectHydrator.readCatalog({ state }),
			},
		};

	const { mutation, nextState, projectedStates } = applyBillingPlanToSubjects({
		command,
		customer: state,
		entityParts: parts,
	});
	return {
		kind: "write",
		mutation,
		nextState,
		projectedStates,
	};
};

/** An update of a row the worker does not hold means its copy is behind Postgres: drop it, the caller retries. */
export const decidePlan = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}) => {
	try {
		return scope.ctx.writer.decide<ApplyBillingPlanReply>({
			command,
			durability: "store",
			mutate: ({ state }) => decideApplyBillingPlan({ scope, state, command }),
		});
	} catch (cause) {
		if (!(cause instanceof StaleMutationError)) throw cause;
		await dropStaleSubject({ scope, identity: command.identity });
		throw new SubjectStaleError({ identity: command.identity, cause });
	}
};
