import {
	applyMutation,
	type ConfirmExpiredLockCommand,
	computeConfirmExpiredLock,
	meteringIdentityToPartitionKey,
	parseConfirmExpiredLockCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import type { ConfirmExpiredLockReply } from "@autumn/balance-worker-client/protocol";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

/** Decide now, reply once committed: the same path a finalize takes, with no balance to move. */
export async function confirmExpiredLock({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ConfirmExpiredLockCommand;
}): Promise<ConfirmExpiredLockReply> {
	const { ctx } = scope;
	const parsed = parseConfirmExpiredLockCommand({ input: command });
	const customerKey = meteringIdentityToPartitionKey({
		identity: parsed.identity,
	});
	await ctx.subjectHydrator.ensure({ identity: parsed.identity });

	const decided = ctx.writer.decide<never>({
		command: parsed,
		mutate: ({ state }) =>
			decideConfirmExpiredLock({ scope, state, customerKey, command: parsed }),
	});

	const { mutation } = await decided.waitForCommit();
	if (mutation.result.type !== "confirmExpiredLock") {
		throw new Error(
			`Expire lock ${mutation.id} committed a non-confirmExpiredLock record`,
		);
	}
	return { result: mutation.result };
}

/** Runs inside the writer's critical section: the open-lock check and the deletion are one step. */
function decideConfirmExpiredLock({
	scope,
	state,
	customerKey,
	command,
}: {
	scope: PartitionProcessorScope;
	state: SubjectState | null;
	customerKey: string;
	command: ConfirmExpiredLockCommand;
}): MutationResult<never> {
	if (!state) throw new PartitionProcessorStateNotFoundError({ customerKey });
	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity: command.identity,
	});
	const mutation = computeConfirmExpiredLock({ fullSubject, command });
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}
