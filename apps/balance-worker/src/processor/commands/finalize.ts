import {
	applyMutation,
	computeFinalizeDecision,
	type FinalizeCommand,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { FinalizeReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { withResidentSubject } from "../actions/withResidentSubject.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { decideEffects } from "../effects/decideEffects.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	DecidedMutation,
	MutationResult,
} from "../writer/types/mutation.js";

/** Every finalize, sync or queued, settles its lock here: serialized by the partition writer, the same path a track takes. */
export async function decideFinalize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FinalizeCommand;
}): Promise<DecidedMutation<never>> {
	const { ctx } = scope;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	return withResidentSubject({
		customerKey,
		ensure: () => ensureSubjectCurrent({ scope, command }),
		attempt: () =>
			ctx.writer.decide<never>({
				command,
				mutate: ({ state }) =>
					timeSync({ label: "finalize.decide" }, () =>
						mutateFinalize({ scope, state, customerKey, command }),
					),
			}),
	});
}

/** Sync: decide, then answer the result once the settlement is committed. */
export async function finalize({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: FinalizeCommand;
}): Promise<FinalizeReply> {
	const decided = await decideFinalize({ scope, command });
	const { mutation } = await decided.waitForCommit();
	if (mutation.result.type !== "finalize") {
		throw new Error(`Finalize ${mutation.id} committed a non-finalize record`);
	}
	return { result: mutation.result };
}

/** Runs inside the writer's critical section: the open-lock check and the settlement are one step. */
function mutateFinalize({
	scope,
	state,
	customerKey,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	command: FinalizeCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	// One catalog read serves both views: the rows a mutation adds reference catalog the state already held.
	const catalog = scope.ctx.subjectHydrator.readCatalog({ state });

	const fullSubject = scope.ctx.subjectHydrator.readSubjectWith({
		state,
		catalog,
		identity: command.identity,
	});
	const decision = computeFinalizeDecision({ fullSubject, command });
	const { mutation } = decision;
	const nextState = applyMutation({ state, mutation });
	const after = scope.ctx.subjectHydrator.readSubjectWith({
		state: nextState,
		catalog,
		identity: command.identity,
	});
	return {
		kind: "write",
		mutation,
		nextState,
		effects: decideEffects({ decision, before: fullSubject, after }),
	};
}
