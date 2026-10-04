import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import { enqueueMutation, pendingKeyOf } from "../pendingMutations.js";
import { commandToFingerprint } from "../receipt/commandToFingerprint.js";
import { mutationToRecord } from "../receipt/mutationToRecord.js";
import type { LeanDecision, LeanSubmission } from "../types/mutation.js";
import type {
	LeanBlocker,
	PartitionWriterScope,
} from "../types/partitionWriter.js";
import {
	PartitionWriterCommandConflictError,
	PartitionWriterDuplicateCommandError,
	PartitionWriterStateNotFoundError,
} from "../writerErrors.js";
import { scheduleCommit } from "./commit.js";
import { readFreshestState } from "./decide.js";

/**
 * The lean decide (serial-decide arm D): `decide` without a settlement. Dedup, capacity, projection,
 * the record and the commit loop are the writer's own; what differs is the answer. The reply is built
 * here, from the decided record and the projected rows, and handed back with the record's sequence
 * number: the I/O thread releases it once the partition's commit position reaches that number, and a
 * failed append or a recovery fails every held reply above the position instead of rejecting promises.
 *
 * Synchronous throughout, like `decide`: nothing may separate reading the projection from recording
 * the next one. Null when the customer has a classic command in flight: that command's settlement
 * carries the customer's order, so the caller takes the classic path behind it.
 */
export function decideLean<Reply>({
	scope,
	submission,
}: {
	scope: PartitionWriterScope;
	submission: LeanSubmission<Reply>;
}): LeanDecision<Reply> | null {
	const { ctx, state } = scope;
	if (state.recoveryError) throw state.recoveryError;
	const { command } = submission;
	const { identity, commandId } = command;
	const customerKey = meteringIdentityToPartitionKey({ identity });
	if (hasClassicCommandInFlight({ scope, customerKey })) return null;

	const fingerprint = commandToFingerprint({ command });
	const pendingKey = pendingKeyOf({ customerKey, commandId });
	const inFlight = state.pendingByKey.get(pendingKey);
	if (inFlight) {
		if (inFlight.mutation.receipt.fingerprint !== fingerprint)
			throw new PartitionWriterCommandConflictError({ commandId });
		// Every in-flight write of this customer is lean here, so its reply is kept on it.
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
		if (receipt.receipt.fingerprint !== fingerprint)
			throw new PartitionWriterCommandConflictError({ commandId });
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
	const recalled = ctx.recentCommands.recall({ key: pendingKey, fingerprint });
	if (recalled === "different")
		throw new PartitionWriterCommandConflictError({ commandId });
	if (recalled === "same")
		throw new PartitionWriterDuplicateCommandError({ commandId });

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
		lean: true,
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

/** A settlement-bearing write for the customer is in flight: its callers and waiters own the customer's order. */
function hasClassicCommandInFlight({
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

/** Why `decideLean` would not write this command itself: a classic write owns the customer's order, or the retry's reply is another write's. */
export function leanBlockerOf({
	scope,
	identity,
	commandId,
}: {
	scope: PartitionWriterScope;
	identity: MeteringIdentity;
	commandId: string;
}): LeanBlocker | null {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	if (hasClassicCommandInFlight({ scope, customerKey }))
		return "classic_in_flight";
	if (scope.state.pendingByKey.has(pendingKeyOf({ customerKey, commandId })))
		return "retry_in_flight";
	return null;
}

/** Every lean write `decide` enqueues shares one group, and `takeBatch` keeps a group in one append. */
export function decideLeanGroup<Result>({
	scope,
	decide,
}: {
	scope: PartitionWriterScope;
	decide: () => Result;
}): Result {
	const { state } = scope;
	if (state.leanGroup !== null) return decide();
	state.lastLeanGroup += 1;
	state.leanGroup = state.lastLeanGroup;
	try {
		return decide();
	} finally {
		state.leanGroup = null;
	}
}
