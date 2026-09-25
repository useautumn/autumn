import {
	applyMutation,
	computeDeleteBalance,
	type DeleteBalanceCommand,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { DeleteBalanceReply } from "@autumn/balance-worker-client/protocol";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

/** Decided on the rows as they stand after any due reset; replied once Postgres holds it, so a caller may read it there. */
export async function deleteBalance({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: DeleteBalanceCommand;
}): Promise<DeleteBalanceReply> {
	await ensureSubjectCurrent({ scope, command });

	const decided = scope.ctx.writer.decide<DeleteBalanceReply>({
		command,
		durability: "store",
		mutate: ({ state }) => decideDeleteBalance({ scope, state, command }),
	});
	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) return committed;
	if (committed.mutation.result.type !== "deleteBalance") {
		throw new Error(
			`Delete balance ${committed.mutation.id} committed a non-deleteBalance record`,
		);
	}
	return { result: committed.mutation.result };
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideDeleteBalance({
	scope,
	state,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	command: DeleteBalanceCommand;
}): MutationResult<DeleteBalanceReply> {
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
	const mutation = computeDeleteBalance({ fullSubject, command });
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
