import {
	applyMutation,
	meteringPartitionKeyOf,
	type SubjectState,
	subjectBlobsToSubjectState,
	subjectStateToSubjectBlobs,
} from "@autumn/balance-engine";
import {
	insertReceipt,
	readReceipt,
	updateReceipt,
} from "../../repos/mutationReceipts/mutationReceipts.js";
import {
	insertBlob,
	readStoredView,
	updateBlob,
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
import type { StoredSubjectView } from "../../types/storedSubjectState.js";
import {
	advanceProgress,
	requireNextOffset,
} from "./partitionProgressGuards.js";

type ApplyRecordParams = { ctx: StateStoreContext } & DurableMutationRecord;

/** The stored view the mutation was decided against, proven to belong to the partition this record arrived on. */
const readOwnedView = ({
	ctx,
	position,
	mutation,
	partitionKey,
}: ApplyRecordParams & { partitionKey: string }): StoredSubjectView | null => {
	const stored = readStoredView({ ctx, identity: mutation.identity });
	if (!stored) return null;
	if (
		stored.topic !== position.topic ||
		stored.partition !== position.partition
	) {
		throw new MeteringStatePartitionMismatchError({ partitionKey });
	}
	return stored;
};

/** A fresh customer writes every blob it carries; an existing one writes the customer blob under its revision guard plus the one entity blob the view named. */
const writeView = ({
	ctx,
	position,
	stored,
	nextView,
	revisionBefore,
	partitionKey,
}: ApplyRecordParams & {
	stored: StoredSubjectView | null;
	nextView: SubjectState;
	revisionBefore: number;
	partitionKey: string;
}): void => {
	const blobs = subjectStateToSubjectBlobs({ state: nextView });
	const insert = (state: SubjectState) =>
		insertBlob({
			ctx,
			topic: position.topic,
			partition: position.partition,
			state,
		});

	if (!stored) {
		insert(blobs.customer);
		for (const entityBlob of blobs.entities) insert(entityBlob);
		return;
	}

	const customerUpdate = updateBlob({
		ctx,
		state: blobs.customer,
		revisionBefore,
	});
	if (customerUpdate.changes !== 1) {
		throw new CorruptBalanceStateError({ partitionKey });
	}

	const entityId = nextView.identity.entityId;
	const entityBlob = entityId
		? blobs.entities.find((blob) => blob.identity.entityId === entityId)
		: undefined;
	if (!entityBlob) return;
	if (stored.entity) {
		updateBlob({ ctx, state: entityBlob });
	} else {
		insert(entityBlob);
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

	const stored = readOwnedView({ ctx, position, mutation, partitionKey });
	const view = stored
		? subjectBlobsToSubjectState({
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

	// The view keeps the command's identity so the entity blob it names is the one written back.
	const nextView: SubjectState = {
		...applyMutation({ state: view, mutation }),
		identity: mutation.identity,
	};
	writeView({
		ctx,
		position,
		mutation,
		stored,
		nextView,
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
		state: { ...nextView, identity: { ...nextView.identity, entityId: null } },
		mutation,
		nextOffset,
	};
};
