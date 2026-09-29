import {
	applyMutation,
	computeRecalculateBalance,
	meteringIdentityToPartitionKey,
	type RecalculateBalanceCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import type { RecalculateBalanceReply } from "@autumn/balance-worker-client/protocol";
import { ensureSubjectCurrent } from "../actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { readCurrentSubject } from "../actions/readCurrentSubject.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

/** A preview reads like a check and writes nothing; a recalculation is decided and answered once Postgres holds it. */
export async function recalculateBalance({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: RecalculateBalanceCommand;
}): Promise<RecalculateBalanceReply> {
	if (command.preview) return previewRecalculateBalance({ scope, command });

	await ensureSubjectCurrent({ scope, command });
	const decided = scope.ctx.writer.decide<RecalculateBalanceReply>({
		command,
		durability: "store",
		mutate: ({ state }) => decideRecalculateBalance({ scope, state, command }),
	});
	const committed = await decided.waitForCommit();
	if (!("mutation" in committed)) {
		// Nothing moved, but the caller reads Postgres next: earlier records must have landed first.
		await decided.waitForStore();
		return committed;
	}
	if (committed.mutation.result.type !== "recalculateBalance") {
		throw new Error(
			`Recalculate balance ${committed.mutation.id} committed a non-recalculateBalance record`,
		);
	}
	return { result: committed.mutation.result };
}

async function previewRecalculateBalance({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: RecalculateBalanceCommand;
}): Promise<RecalculateBalanceReply> {
	const { state } = await readCurrentSubject({ scope, command });
	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	return { result: computeRecalculateBalance({ fullSubject, command }).result };
}

/** Runs inside the writer's critical section: no await, no I/O. */
function decideRecalculateBalance({
	scope,
	state,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	command: RecalculateBalanceCommand;
}): MutationResult<RecalculateBalanceReply> {
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
	const { result, mutation } = computeRecalculateBalance({
		fullSubject,
		command,
	});
	if (!mutation) return { kind: "reply", reply: { result } };
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
