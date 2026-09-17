import {
	applyMutation,
	mergeSubjectStates,
	meteringIdentityToPartitionKey,
	type SubjectState,
	splitSubjectState,
} from "@autumn/balance-engine";
import {
	insertReceipt,
	readReceipt,
	updateReceipt,
} from "../../repos/mutationReceipts/mutationReceipts.js";
import {
	insertState,
	readStoredStates,
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
import type { StoredSubjectStates } from "../../types/storedSubjectState.js";
import {
	advanceProgress,
	requireNextOffset,
} from "./partitionProgressGuards.js";

type ApplyRecordParams = { ctx: StateStoreContext } & DurableMutationRecord;

/** The stored view the mutation was decided against, proven to belong to the partition this record arrived on. */
const readOwnedStates = ({
	ctx,
	position,
	mutation,
	partitionKey,
}: ApplyRecordParams & {
	partitionKey: string;
}): StoredSubjectStates | null => {
	const stored = readStoredStates({ ctx, identity: mutation.identity });
	if (!stored) return null;
	if (
		stored.topic !== position.topic ||
		stored.partition !== position.partition
	) {
		throw new MeteringStatePartitionMismatchError({ partitionKey });
	}
	return stored;
};

/** The customer's state goes under its revision guard; the entity's own state rides along under it. */
const writeStates = ({
	ctx,
	position,
	stored,
	nextState,
	revisionBefore,
	partitionKey,
}: ApplyRecordParams & {
	stored: StoredSubjectStates | null;
	nextState: SubjectState;
	revisionBefore: number;
	partitionKey: string;
}): void => {
	const states = splitSubjectState({ state: nextState });
	const insert = (state: SubjectState) =>
		insertState({
			ctx,
			topic: position.topic,
			partition: position.partition,
			state,
		});

	if (!stored) {
		insert(states.customer);
	} else {
		const customerUpdate = updateState({
			ctx,
			state: states.customer,
			revisionBefore,
		});
		if (customerUpdate.changes !== 1) {
			throw new CorruptBalanceStateError({ partitionKey });
		}
	}

	if (!states.entity) return;
	if (stored?.entity) {
		updateState({ ctx, state: states.entity });
	} else {
		insert(states.entity);
	}
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

	const partitionKey = meteringIdentityToPartitionKey({
		identity: mutation.identity,
	});
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

	const stored = readOwnedStates({ ctx, position, mutation, partitionKey });
	const view = stored
		? mergeSubjectStates({
				customer: stored.customer,
				entity: stored.entity,
			})
		: null;
	// A receipt past this mutation's base revision is already folded into the state;
	// an older one is a replay of a receipt the owner pruned, so it gets overwritten.
	const receiptCoversState =
		storedReceipt !== null &&
		storedReceipt.mutation.revision.after > mutation.revision.before;
	if (storedReceipt && receiptCoversState) {
		if (!view) throw new CorruptBalanceStateError({ partitionKey });
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
			state: view,
			mutation: storedReceipt.mutation,
			nextOffset,
		};
	}

	// Keeps the command's identity so the entity state it names is the one written back.
	const nextState: SubjectState = {
		...applyMutation({ state: view, mutation }),
		identity: mutation.identity,
	};
	writeStates({
		ctx,
		position,
		mutation,
		stored,
		nextState,
		revisionBefore: mutation.revision.before,
		partitionKey,
	});

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
	return {
		kind: "applied",
		state: {
			...nextState,
			identity: { ...nextState.identity, entityId: null },
		},
		mutation,
		nextOffset,
	};
};
