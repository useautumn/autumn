import {
	applyMutation,
	computeUpdateBalance,
	meteringIdentityToPartitionKey,
	type SubjectState,
	type UpdateBalanceCommand,
} from "@autumn/balance-engine";
import type { UpdateBalanceReply } from "@autumn/balance-worker-client/protocol";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type {
	DecidedMutation,
	MutationResult,
} from "../writer/types/mutation.js";

/** Every balance update, sync or queued, is decided here on the rows as they stand after any due reset. No effects: legacy fires none. */
export async function decideUpdateBalance({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: UpdateBalanceCommand;
}): Promise<DecidedMutation<UpdateBalanceReply>> {
	await ensureSubjectCurrent({ scope, command });
	return scope.ctx.writer.decide<UpdateBalanceReply>({
		command,
		mutate: ({ state }) => mutateUpdateBalance({ scope, state, command }),
	});
}

/** Sync: decide, then answer once Kafka holds it. */
export async function updateBalance({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: UpdateBalanceCommand;
}): Promise<UpdateBalanceReply> {
	const decided = await decideUpdateBalance({ scope, command });
	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) return committed;
	if (committed.mutation.result.type !== "updateBalance") {
		throw new Error(
			`Update balance ${committed.mutation.id} committed a non-updateBalance record`,
		);
	}
	return { result: committed.mutation.result };
}

/** Runs inside the writer's critical section: no await, no I/O. */
function mutateUpdateBalance({
	scope,
	state,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	command: UpdateBalanceCommand;
}): MutationResult<UpdateBalanceReply> {
	if (!state) {
		throw new PartitionProcessorStateNotFoundError({
			customerKey: meteringIdentityToPartitionKey({
				identity: command.identity,
			}),
		});
	}
	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const mutation = computeUpdateBalance({ fullSubject, command });
	if (!mutation) return { kind: "reply", reply: { result: null } };
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
