import {
	applyMutation,
	type ConfirmExpiredLockCommand,
	computeConfirmExpiredLock,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { ConfirmExpiredLockReply } from "@autumn/balance-worker-client/protocol";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";
import type { MutationResult } from "../writer/types/mutation.js";

export async function confirmExpiredLock({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ConfirmExpiredLockCommand;
}): Promise<ConfirmExpiredLockReply> {
	const { ctx } = scope;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	await ctx.subjectHydrator.ensure({ identity: command.identity });

	const decided = ctx.writer.decide<never>({
		command,
		mutate: ({ state }) =>
			timeSync({ label: "confirmExpiredLock.decide" }, () =>
				mutateConfirmExpiredLock({
					scope,
					state,
					customerKey,
					command,
				}),
			),
	});

	const { mutation } = await decided.waitForCommit();
	if (mutation.result.type !== "confirmExpiredLock") {
		throw new Error(
			`Expire lock ${mutation.id} committed a non-confirmExpiredLock record`,
		);
	}
	return { result: mutation.result };
}

function mutateConfirmExpiredLock({
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
