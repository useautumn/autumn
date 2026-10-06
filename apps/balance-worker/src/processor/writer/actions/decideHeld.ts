/**
 * `decide` without a settlement: dedup, capacity, projection, the record and the commit loop are the writer's
 * own, but the reply is built here and held until the commit position reaches its write's sequence number.
 */
import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import {
	enqueueMutation,
	maxBatchBytesOf,
	pendingKeyOf,
	settlementOf,
} from "../pendingMutations.js";
import { commandToFingerprint } from "../receipt/commandToFingerprint.js";
import { mutationToRecord } from "../receipt/mutationToRecord.js";
import type { HeldDecision, HeldSubmission } from "../types/mutation.js";
import type {
	HeldBlocker,
	PartitionWriterScope,
	PendingMutation,
} from "../types/partitionWriter.js";
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

/** Why `decideHeld` would hand this command back: a settled write owns the customer's order, or the retry's reply is another write's. */
export function heldBlockerOf({
	scope,
	identity,
	commandId,
}: {
	scope: PartitionWriterScope;
	identity: MeteringIdentity;
	commandId: string;
}): HeldBlocker | null {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	if (hasSettledWriteInFlight({ scope, customerKey }))
		return "settled_write_in_flight";
	if (scope.state.pendingByKey.has(pendingKeyOf({ customerKey, commandId })))
		return "retry_in_flight";
	return null;
}

/** Whether the group fits one append: past the byte budget its writes split, as the ordinary route's do.
 *  Every member's subjects stay pinned while it runs, so one member's write cannot evict another's rows. */
export function decideHeldGroup<Result>({
	scope,
	identities,
	decide,
}: {
	scope: PartitionWriterScope;
	identities: MeteringIdentity[];
	decide: () => Result;
}): { result: Result; fitsOneAppend: boolean } {
	const { state, config } = scope;
	if (state.heldGroup !== null) throw new Error("Held groups do not nest");
	state.lastHeldGroup += 1;
	const group = state.lastHeldGroup;
	state.heldGroup = group;
	state.heldGroupBytes = 0;
	const subjectKeys = identities.flatMap((identity) => [
		meteringIdentityToSubjectKey({ identity: { ...identity, entityId: null } }),
		...(identity.entityId ? [meteringIdentityToSubjectKey({ identity })] : []),
	]);
	for (const subjectKey of subjectKeys) state.subjects.pin({ subjectKey });
	try {
		const result = decide();
		const fitsOneAppend =
			state.heldGroupBytes <= maxBatchBytesOf({ limits: config.limits });
		if (!fitsOneAppend) releaseHeldGroup({ queue: state.queue, group });
		return { result, fitsOneAppend };
	} finally {
		state.heldGroup = null;
		for (const subjectKey of subjectKeys) state.subjects.unpin({ subjectKey });
	}
}

/** A group past the byte budget takes the ordinary batch cut, so its writes span appends. */
function releaseHeldGroup({
	queue,
	group,
}: {
	queue: PendingMutation[];
	group: number;
}): void {
	for (let index = queue.length - 1; queue[index]?.heldGroup === group; index--)
		delete (queue[index] as PendingMutation).heldGroup;
}

/** Resolves once the log has this held write; rejects with its failure. Only for a write still in flight. */
export function waitForHeldCommit({
	scope,
	identity,
	commandId,
}: {
	scope: PartitionWriterScope;
	identity: MeteringIdentity;
	commandId: string;
}): Promise<void> {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	const pending = scope.state.pendingByKey.get(
		pendingKeyOf({ customerKey, commandId }),
	);
	return pending ? settlementOf({ pending }).waitForLog() : Promise.resolve();
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
