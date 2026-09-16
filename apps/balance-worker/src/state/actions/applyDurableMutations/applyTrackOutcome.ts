import {
	executeTrack as executeEngineTrack,
	meteringPartitionKeyOf,
} from "@autumn/balance-engine";
import {
	readStoredState,
	updateState,
} from "../../repos/customerStates/customerStates.js";
import {
	insertTrackReceipt,
	readTrackReceipt,
	updateTrackReceipt,
} from "../../repos/trackReceipts/trackReceipts.js";
import {
	CorruptBalanceStateError,
	MeteringStateNotFoundError,
	MeteringStatePartitionMismatchError,
} from "../../sqliteBalanceStateErrors.js";
import type {
	DurableTrackOutcomeApplyResult,
	DurableTrackOutcomeRecord,
} from "../../types/durableMutation.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import {
	advanceProgress,
	requireNextOffset,
} from "./partitionProgressGuards.js";

export const applyTrackOutcome = ({
	ctx,
	position,
	outcome,
}: {
	ctx: StateStoreContext;
} & DurableTrackOutcomeRecord): DurableTrackOutcomeApplyResult => {
	const expectedOffset = requireNextOffset({ ctx, position });
	if (position.offset < expectedOffset) {
		return {
			kind: "position_already_applied",
			nextOffset: expectedOffset,
		};
	}

	const partitionKey = meteringPartitionKeyOf({ identity: outcome.identity });
	const storedState = readStoredState({ ctx, identity: outcome.identity });
	if (!storedState) throw new MeteringStateNotFoundError({ partitionKey });
	if (
		storedState.topic !== position.topic ||
		storedState.partition !== position.partition
	) {
		throw new MeteringStatePartitionMismatchError({ partitionKey });
	}
	const { state } = storedState;

	const existingReceipt = readTrackReceipt({
		ctx,
		identity: outcome.identity,
		commandId: outcome.commandId,
	});
	const executed = executeEngineTrack({
		state,
		outcome,
		existingReceipt,
	});
	const nextOffset = position.offset + 1n;

	if (executed.kind === "applied") {
		const stateUpdate = updateState({
			ctx,
			partitionKey,
			revisionBefore: outcome.revisionBefore,
			state: executed.state,
		});
		if (stateUpdate.changes !== 1) {
			throw new CorruptBalanceStateError({ partitionKey });
		}

		if (existingReceipt) {
			const receiptUpdate = updateTrackReceipt({
				ctx,
				partitionKey,
				position,
				receipt: executed.receipt,
			});
			if (receiptUpdate.changes !== 1) {
				throw new CorruptBalanceStateError({ partitionKey });
			}
		} else {
			insertTrackReceipt({
				ctx,
				partitionKey,
				position,
				receipt: executed.receipt,
			});
		}
	}

	advanceProgress({ ctx, position, expectedOffset, nextOffset });

	return {
		kind: executed.kind,
		state: executed.state,
		receipt: executed.receipt,
		nextOffset,
	};
};
