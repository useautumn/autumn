/**
 * `decide` without a settlement: dedup, capacity, projection, the record and the commit loop are the writer's
 * own, but the reply is built here and held until the commit position reaches its write's sequence number.
 */
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import { enqueueMutation, pendingKeyOf } from "../pendingMutations.js";
import { commandToFingerprint } from "../receipt/commandToFingerprint.js";
import { mutationToRecord } from "../receipt/mutationToRecord.js";
import type { HeldDecision, HeldSubmission } from "../types/mutation.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import {
	PartitionWriterDuplicateCommandError,
	PartitionWriterStateNotFoundError,
} from "../writerErrors.js";
import { scheduleCommit } from "./commit.js";
import { assertSameRequest, readFreshestState } from "./decide.js";

/** Synchronous, like `decide`. Null when a settled write of the customer is in flight: its callers own the order. */
export function decideHeld<Reply>({
	scope,
	submission,
}: {
	scope: PartitionWriterScope;
	submission: HeldSubmission<Reply>;
}): HeldDecision<Reply> | null {
	const { ctx, state } = scope;
	if (state.recoveryError) throw state.recoveryError;
	const { command } = submission;
	const { identity, commandId } = command;
	const customerKey = meteringIdentityToPartitionKey({ identity });
	if (hasSettledWriteInFlight({ scope, customerKey })) return null;

	const fingerprint = commandToFingerprint({ command });
	const pendingKey = pendingKeyOf({ customerKey, commandId });
	const inFlight = state.pendingByKey.get(pendingKey);
	if (inFlight) {
		assertSameRequest({
			commandId,
			fingerprint,
			record: inFlight.mutation.receipt,
		});
		return {
			kind: "duplicate",
			seq: inFlight.seq,
			body: inFlight.replyBody ?? "",
		};
	}
	const currentState = readFreshestState({ scope, identity });
	const receipt = ctx.stateStore.readReceipt({
		identity,
		mutationId: commandId,
	});
	if (receipt) {
		assertSameRequest({ commandId, fingerprint, record: receipt.receipt });
		if (!currentState)
			throw new PartitionWriterStateNotFoundError({ customerKey });
		return {
			kind: "duplicate",
			seq: 0,
			body: submission.replyOf({
				kind: "duplicate",
				mutation: receipt,
				state: currentState,
			}),
		};
	}
	const remembered = ctx.recentCommands.read({ identity, commandId });
	if (remembered) {
		assertSameRequest({ commandId, fingerprint, record: remembered });
		throw new PartitionWriterDuplicateCommandError({ commandId });
	}

	const result = submission.mutate({ state: currentState });
	if (result.kind === "reply") return { kind: "reply", reply: result.reply };
	ctx.onStateAdvanced?.({
		from: currentState,
		to: result.nextState,
		changes: result.mutation.changes,
	});
	const pending = enqueueMutation({
		scope,
		pendingKey,
		customerKey,
		mutation: mutationToRecord({
			mutation: result.mutation,
			fingerprint,
			receiptPolicy: ctx.receiptPolicy,
		}),
		nextState: result.nextState,
		projectedStates: result.projectedStates,
		durability: "log",
		effects: result.effects,
		held: true,
	});
	const body = submission.replyOf({
		kind: "new",
		mutation: pending.mutation,
		state: result.nextState,
	});
	pending.replyBody = body;
	scheduleCommit({ scope });
	return { kind: "write", seq: pending.seq, body };
}

function hasSettledWriteInFlight({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): boolean {
	const customerPending = scope.state.pendingByCustomerKey.get(customerKey);
	if (!customerPending) return false;
	for (const pending of customerPending)
		if (pending.settlement !== null) return true;
	return false;
}
