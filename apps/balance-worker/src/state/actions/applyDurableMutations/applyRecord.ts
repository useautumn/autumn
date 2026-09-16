import { applyMutation, meteringPartitionKeyOf } from "@autumn/balance-engine";
import {
	insertReceipt,
	readReceipt,
	updateReceipt,
} from "../../repos/mutationReceipts/mutationReceipts.js";
import {
	insertState,
	readStoredState,
	updateState,
} from "../../repos/subjectStates/subjectStates.js";
import {
	ConflictingMutationReceiptError,
	CorruptBalanceStateError,
	MeteringStatePartitionMismatchError,
} from "../../stateStoreErrors.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../types/durableMutation.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import {
	advanceProgress,
	requireNextOffset,
} from "./partitionProgressGuards.js";

type ApplyRecordParams = { ctx: StateStoreContext } & DurableMutationRecord;

/** The stored state, proven to belong to the partition this record arrived on. */
const readOwnedState = ({
	ctx,
	position,
	mutation,
	partitionKey,
}: ApplyRecordParams & { partitionKey: string }) => {
	const stored = readStoredState({ ctx, identity: mutation.identity });
	if (!stored) return null;
	if (
		stored.topic !== position.topic ||
		stored.partition !== position.partition
	) {
		throw new MeteringStatePartitionMismatchError({ partitionKey });
	}
	return stored.state;
};

/** One write path: the log orders the mutation, the receipt only answers "have I seen this id". */
export const applyRecord = ({
	ctx,
	position,
	mutation,
}: ApplyRecordParams): DurableMutationApplyResult => {
	const expectedOffset = requireNextOffset({ ctx, position });
	if (position.offset < expectedOffset) {
		return { kind: "position_already_applied", nextOffset: expectedOffset };
	}

	const partitionKey = meteringPartitionKeyOf({ identity: mutation.identity });
	const nextOffset = position.offset + 1n;
	const storedReceipt = readReceipt({
		ctx,
		identity: mutation.identity,
		mutationId: mutation.id,
	});
	if (
		storedReceipt &&
		storedReceipt.mutation.receipt.fingerprint !== mutation.receipt.fingerprint
	) {
		throw new ConflictingMutationReceiptError({
			partitionKey,
			mutationId: mutation.id,
		});
	}

	const state = readOwnedState({ ctx, position, mutation, partitionKey });
	// A receipt past this mutation's base revision is already folded into the state;
	// an older one is a replay of a receipt the owner pruned, so it gets overwritten.
	const receiptCoversState =
		storedReceipt !== null &&
		storedReceipt.mutation.revision.after > mutation.revision.before;
	if (storedReceipt && receiptCoversState) {
		if (!state) throw new CorruptBalanceStateError({ partitionKey });
		if (position.offset > storedReceipt.recordOffset) {
			updateReceipt({
				ctx,
				partitionKey,
				position,
				mutation: storedReceipt.mutation,
			});
		}
		advanceProgress({ ctx, position, expectedOffset, nextOffset });
		return {
			kind: "duplicate",
			state,
			mutation: storedReceipt.mutation,
			nextOffset,
		};
	}

	const nextState = applyMutation({ state, mutation });
	if (state) {
		const stateUpdate = updateState({
			ctx,
			partitionKey,
			revisionBefore: mutation.revision.before,
			state: nextState,
		});
		if (stateUpdate.changes !== 1) {
			throw new CorruptBalanceStateError({ partitionKey });
		}
	} else {
		insertState({
			ctx,
			partitionKey,
			topic: position.topic,
			partition: position.partition,
			state: nextState,
		});
	}

	if (storedReceipt) {
		const receiptUpdate = updateReceipt({
			ctx,
			partitionKey,
			position,
			mutation,
		});
		if (receiptUpdate.changes !== 1) {
			throw new CorruptBalanceStateError({ partitionKey });
		}
	} else {
		insertReceipt({ ctx, partitionKey, position, mutation });
	}

	advanceProgress({ ctx, position, expectedOffset, nextOffset });
	return { kind: "applied", state: nextState, mutation, nextOffset };
};
