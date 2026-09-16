import {
	type CustomerMeteringState,
	meteringPartitionKeyOf,
	parseStateInitializedEvent,
	type StateInitializedEvent,
	stateInitializationFingerprintOf,
} from "@autumn/balance-engine";
import {
	insertState,
	readStoredState,
} from "../../repos/customerStates/customerStates.js";
import { ConflictingMeteringStateInitializationError } from "../../sqliteBalanceStateErrors.js";
import type {
	DurableStateInitializationApplyResult,
	DurableStateInitializationRecord,
} from "../../types/durableMutation.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import {
	advanceProgress,
	requireNextOffset,
} from "./partitionProgressGuards.js";

export const parsePersistedInitialization = ({
	initialization,
}: {
	initialization: StateInitializedEvent;
}): StateInitializedEvent => {
	const parsedInitialization = parseStateInitializedEvent({
		input: initialization,
	});
	return parseStateInitializedEvent({
		input: JSON.parse(JSON.stringify(parsedInitialization)),
	});
};

export const initializeParsedState = ({
	ctx,
	topic,
	partition,
	initialization,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	initialization: StateInitializedEvent;
}): {
	kind: "initialized" | "duplicate";
	state: CustomerMeteringState;
} => {
	const partitionKey = meteringPartitionKeyOf({
		identity: initialization.state.identity,
	});
	const initializationFingerprint = stateInitializationFingerprintOf({
		initialization,
	});
	const existing = readStoredState({
		ctx,
		identity: initialization.state.identity,
	});
	if (existing) {
		if (
			existing.topic === topic &&
			existing.partition === partition &&
			existing.initializationId === initialization.initializationId &&
			existing.initializationFingerprint === initializationFingerprint
		) {
			return { kind: "duplicate", state: existing.state };
		}
		throw new ConflictingMeteringStateInitializationError({ partitionKey });
	}

	insertState({
		ctx,
		partitionKey,
		topic,
		partition,
		initializationId: initialization.initializationId,
		initializationFingerprint,
		state: initialization.state,
	});
	return { kind: "initialized", state: initialization.state };
};

export const applyStateInitialization = ({
	ctx,
	position,
	initialization,
}: {
	ctx: StateStoreContext;
} & DurableStateInitializationRecord): DurableStateInitializationApplyResult => {
	const expectedOffset = requireNextOffset({ ctx, position });
	if (position.offset < expectedOffset) {
		return { kind: "position_already_applied", nextOffset: expectedOffset };
	}
	const initialized = initializeParsedState({
		ctx,
		topic: position.topic,
		partition: position.partition,
		initialization,
	});
	const nextOffset = position.offset + 1n;
	advanceProgress({ ctx, position, expectedOffset, nextOffset });
	return { ...initialized, nextOffset };
};
