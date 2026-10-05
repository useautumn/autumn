import {
	type MutatingCommand,
	type MutationSource,
	meteringIdentityToPartitionKey,
	type SubjectStateMutation,
} from "@autumn/balance-engine";
import {
	enqueueMutation,
	pendingKeyOf,
	settlementOf,
} from "../pendingMutations.js";
import { commandToFingerprint } from "../receipt/commandToFingerprint.js";
import { mutationToRecord } from "../receipt/mutationToRecord.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import { scheduleCommit, scheduleDeferredCommit } from "./commit.js";

/** Appends a record that leaves no rows resident; its id is fresh, so there is nothing to dedup. */
export function log({
	scope,
	command,
	mutation,
	source,
	defersCommit = false,
}: {
	scope: PartitionWriterScope;
	command: MutatingCommand;
	mutation: SubjectStateMutation;
	source?: MutationSource;
	defersCommit?: boolean;
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
			source,
		}),
		nextState: null,
		durability: "log",
		defersCommit,
	});
	if (defersCommit) scheduleDeferredCommit({ scope });
	else scheduleCommit({ scope });
	return settlementOf({ pending }).waitForLog();
}
