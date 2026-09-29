import {
	type MutatingCommand,
	meteringIdentityToPartitionKey,
	type SubjectStateMutation,
} from "@autumn/balance-engine";
import { enqueueMutation, pendingKeyOf } from "../pendingMutations.js";
import { commandToFingerprint } from "../receipt/commandToFingerprint.js";
import { mutationToRecord } from "../receipt/mutationToRecord.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import { scheduleCommit } from "./commit.js";

/** Appends a record that leaves no rows resident; its id is fresh, so there is nothing to dedup. */
export function log({
	scope,
	command,
	mutation,
}: {
	scope: PartitionWriterScope;
	command: MutatingCommand;
	mutation: SubjectStateMutation;
}): Promise<void> {
	const { ctx, state } = scope;
	if (state.recoveryError) throw state.recoveryError;
	const customerKey = meteringIdentityToPartitionKey({
		identity: command.identity,
	});
	const pending = enqueueMutation({
		scope,
		pendingKey: pendingKeyOf({ customerKey, commandId: command.commandId }),
		customerKey,
		mutation: mutationToRecord({
			mutation,
			fingerprint: commandToFingerprint({ command }),
			receiptPolicy: ctx.receiptPolicy,
		}),
		nextState: null,
		durability: "log",
	});
	scheduleCommit({ scope });
	return pending.settlement.waitForLog();
}
