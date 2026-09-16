import {
	applyMutation,
	type CustomerState,
	type CustomerStateMutation,
	computeInitialize,
	computeTrack,
	createCustomerState,
	type LeanCustomerEntitlement,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type OverageBehavior,
	parseInitializeCommand,
	parseTrackCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import { createPartitionCheckpoint } from "../../src/checkpoint/partitionCheckpoint.js";
import type { DurableMutationApplyResult } from "../../src/state/types/durableMutation.js";
import type { StateStore } from "../../src/state/types/stateStore.js";

export const testIdentity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
};

export const testOccurredAt = 1_700_000_000_000;
export const testDeduplicationExpiresAt = 1_700_086_400_000;

export const createCustomerEntitlement = ({
	id = "messages_monthly",
	featureId = "messages",
	balance = 10,
	usage = 0,
	externalId = null,
	planId = null,
	reset = null,
}: {
	id?: string;
	featureId?: string;
	balance?: number;
	usage?: number;
	externalId?: string | null;
	planId?: string | null;
	reset?: LeanCustomerEntitlement["reset"];
} = {}): LeanCustomerEntitlement => ({
	id,
	externalId,
	featureId,
	balance,
	usage,
	granted: balance + usage,
	planId,
	reset,
	expiresAt: null,
});

export const createState = ({
	identity = testIdentity,
	balance = 10,
	customerEntitlements,
}: {
	identity?: MeteringIdentity;
	balance?: number;
	customerEntitlements?: LeanCustomerEntitlement[];
} = {}): CustomerState =>
	createCustomerState({
		identity,
		customerEntitlements: customerEntitlements ?? [
			createCustomerEntitlement({ balance }),
		],
	});

export const createTrackCommand = ({
	identity = testIdentity,
	commandId = "cmd_1",
	requestId,
	featureId = "messages",
	value = 5,
	overageBehavior = "reject",
	entityId = null,
	occurredAt = testOccurredAt,
}: {
	identity?: MeteringIdentity;
	commandId?: string;
	requestId?: string;
	featureId?: string;
	value?: number;
	overageBehavior?: OverageBehavior;
	entityId?: string | null;
	occurredAt?: number;
} = {}): TrackCommand =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: requestId ?? `req_${commandId}`,
			identity,
			entityId,
			featureId,
			value,
			overageBehavior,
			properties: null,
			occurredAt,
		},
	});

export const createInitializeCommand = ({
	state = createState(),
	commandId = "init_1",
	requestId = "req_init_1",
	occurredAt = testOccurredAt,
}: {
	state?: CustomerState;
	commandId?: string;
	requestId?: string;
	occurredAt?: number;
} = {}) =>
	parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			requestId,
			commandId,
			identity: state.identity,
			state,
			occurredAt,
		},
	});

export const createInitializeMutation = ({
	state = createState(),
	commandId = "init_1",
	requestId = "req_init_1",
	occurredAt = testOccurredAt,
	deduplicationExpiresAt = testDeduplicationExpiresAt,
}: {
	state?: CustomerState;
	commandId?: string;
	requestId?: string;
	occurredAt?: number;
	deduplicationExpiresAt?: number;
} = {}): CustomerStateMutation =>
	computeInitialize({
		command: createInitializeCommand({
			state,
			commandId,
			requestId,
			occurredAt,
		}),
		deduplicationExpiresAt,
	});

export const createTrackMutation = ({
	state = createState(),
	command,
	deduplicationExpiresAt = testDeduplicationExpiresAt,
	...commandOverrides
}: {
	state?: CustomerState;
	command?: TrackCommand;
	deduplicationExpiresAt?: number;
	commandId?: string;
	requestId?: string;
	featureId?: string;
	value?: number;
	overageBehavior?: OverageBehavior;
	occurredAt?: number;
} = {}): CustomerStateMutation => {
	const decision = computeTrack({
		state,
		command:
			command ??
			createTrackCommand({ identity: state.identity, ...commandOverrides }),
		deduplicationExpiresAt,
	});
	if (decision.kind !== "new") {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const requireNewMutation = ({
	decision,
}: {
	decision: { kind: string; mutation?: CustomerStateMutation };
}): CustomerStateMutation => {
	if (decision.kind !== "new" || !decision.mutation) {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const applyDurableMutation = ({
	store,
	topic,
	partition,
	offset,
	mutation,
}: {
	store: Pick<StateStore, "applyDurableMutations">;
	topic: string;
	partition: number;
	offset: bigint;
	mutation: CustomerStateMutation;
}): DurableMutationApplyResult => {
	const [result] = store.applyDurableMutations({
		records: [{ position: { topic, partition, offset }, mutation }],
	});
	if (!result) throw new Error("Expected a durable mutation result");
	return result;
};

/** Seeds a customer the way the log does: one initialize mutation at `offset`. */
export const seedCustomerState = ({
	store,
	topic,
	partition,
	offset = 0n,
	state = createState(),
	commandId = "init_1",
	deduplicationExpiresAt,
}: {
	store: Pick<StateStore, "applyDurableMutations">;
	topic: string;
	partition: number;
	offset?: bigint;
	state?: CustomerState;
	commandId?: string;
	deduplicationExpiresAt?: number;
}): CustomerState => {
	const mutation = createInitializeMutation({
		state,
		commandId,
		deduplicationExpiresAt,
	});
	applyDurableMutation({ store, topic, partition, offset, mutation });
	return applyMutation({ state: null, mutation });
};

/** Seeds state without consuming a log offset, the way a checkpoint restore does. */
export const restoreCustomerStates = ({
	store,
	topic,
	partition,
	states,
	nextOffset,
}: {
	store: Pick<StateStore, "restorePartitionCheckpoint" | "readNextOffset">;
	topic: string;
	partition: number;
	states: CustomerState[];
	nextOffset?: bigint;
}): void => {
	const existingNextOffset = store.readNextOffset({ topic, partition });
	store.restorePartitionCheckpoint({
		checkpoint: createPartitionCheckpoint({
			engineSchemaVersion: 1,
			createdAt: 0,
			topic,
			partition,
			nextOffset: nextOffset ?? existingNextOffset ?? 0n,
			states: states.map((state) => ({
				partitionKey: meteringPartitionKeyOf({ identity: state.identity }),
				state,
			})),
			receipts: [],
		}),
		mode: existingNextOffset === null ? "restore" : "replace",
		limits: {
			maxSerializedBytes: 16 * 1024 * 1024,
			maxStates: 10_000,
			maxReceipts: 10_000,
		},
		partitionResolver: { partitionForIdentity: () => partition },
	});
};
