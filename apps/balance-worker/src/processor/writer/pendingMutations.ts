import {
	type MutationRecord,
	meteringIdentityToSubjectKey,
	type SubjectState,
	splitSubjectState,
	subjectStateToLogState,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createSubjectMap } from "./subjectMap/createSubjectMap.js";
import type {
	CommittedMutation,
	MutationDurability,
} from "./types/mutation.js";
import type {
	PartitionWriterScope,
	PartitionWriterState,
	PendingMutation,
	PendingSettlement,
} from "./types/partitionWriter.js";
import {
	PartitionWriterCapacityError,
	PartitionWriterRecordTooLargeError,
} from "./writerErrors.js";

export function createPartitionWriterState(): PartitionWriterState {
	return {
		subjects: createSubjectMap(),
		pendingByKey: new Map(),
		pendingByCustomerKey: new Map(),
		queue: [],
		draining: false,
		storeCompletion: Promise.resolve(),
		unapplied: [],
		applyTail: Promise.resolve(),
		applying: false,
		drainScheduled: false,
		recoveryError: null,
	};
}

export function pendingKeyOf({
	customerKey,
	commandId,
}: {
	customerKey: string;
	commandId: string;
}): string {
	return JSON.stringify([customerKey, commandId]);
}

export function createPendingSettlement(): PendingSettlement {
	const stored = Promise.withResolvers<void>();
	// Log-only callers may never wait for the store; failure still reaches store waiters.
	void stored.promise.catch(() => undefined);
	const waiters: {
		kind: CommittedMutation["kind"];
		resolvers: ReturnType<typeof Promise.withResolvers<CommittedMutation>>;
	}[] = [];

	function join({
		kind,
	}: {
		kind: CommittedMutation["kind"];
	}): Promise<CommittedMutation> {
		const resolvers = Promise.withResolvers<CommittedMutation>();
		waiters.push({ kind, resolvers });
		return resolvers.promise;
	}

	function settle({
		mutation,
		state,
	}: {
		mutation: MutationRecord;
		state: SubjectState;
	}): void {
		for (const { kind, resolvers } of waiters) {
			resolvers.resolve({ kind, mutation, state });
		}
	}

	function waitForStore(): Promise<void> {
		return stored.promise;
	}

	function settleStore(): void {
		stored.resolve();
	}

	function rejectCommit({ error }: { error: unknown }): void {
		for (const { resolvers } of waiters) resolvers.reject(error);
	}

	function reject({ error }: { error: unknown }): void {
		rejectCommit({ error });
		stored.reject(error);
	}

	return { join, settle, waitForStore, settleStore, rejectCommit, reject };
}

/** Kafka refuses a batch over the topic's max.message.bytes (1 MiB by default).
 *  gzip only saves about a quarter on these records, so the raw budget stays
 *  well under the limit rather than counting on compression. */
export const DEFAULT_MAX_BATCH_BYTES = 800_000;
/** Key, envelope and Kafka's per-record framing beside the JSON payload. */
export const RECORD_OVERHEAD_BYTES = 256;

/** The record the log receives: the mutation, plus the state it left behind when it logs one. */
export function loggedRecordOf({
	mutation,
	nextState,
	logsAfter,
}: {
	mutation: MutationRecord;
	nextState: SubjectState;
	logsAfter?: boolean;
}): MeteringRecord {
	if (!logsAfter) return mutation;
	return {
		...mutation,
		after: { state: subjectStateToLogState({ state: nextState }) },
	};
}

/** Bounds how far the store may trail the log: each unapplied batch keeps its
 *  store-durability callers waiting and its milestones in memory. */
export const DEFAULT_MAX_UNAPPLIED_BATCHES = 16;

export const maxUnappliedBatchesOf = ({
	limits,
}: {
	limits: PartitionWriterScope["config"]["limits"];
}): number => limits.maxUnappliedBatches ?? DEFAULT_MAX_UNAPPLIED_BATCHES;

export const maxBatchBytesOf = ({
	limits,
}: {
	limits: PartitionWriterScope["config"]["limits"];
}): number => limits.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;

/** A queued mutation owns both durability milestones, even after its log reply releases its pins. */
export function enqueueMutation({
	scope,
	pendingKey,
	customerKey,
	mutation,
	nextState,
	projectedStates: explicitProjectedStates,
	durability,
	logsAfter,
}: {
	scope: PartitionWriterScope;
	pendingKey: string;
	customerKey: string;
	mutation: MutationRecord;
	nextState: SubjectState;
	projectedStates?: SubjectState[];
	durability: MutationDurability;
	logsAfter?: boolean;
}): PendingMutation {
	const { state, config } = scope;
	const customerPending =
		state.pendingByCustomerKey.get(customerKey) ?? new Set<PendingMutation>();
	if (
		state.pendingByKey.size >= config.limits.maxPendingCommands ||
		customerPending.size >= config.limits.maxPendingCommandsPerCustomer
	) {
		throw new PartitionWriterCapacityError();
	}
	// Refused before anything is projected: a record no batch can carry would
	// otherwise fail at commit and take the partition, and its worker, with it.
	const loggedRecord = loggedRecordOf({ mutation, nextState, logsAfter });
	const encodedBytes =
		(scope.ctx.appender.encodedBytesOf?.({ record: loggedRecord }) ??
			Buffer.byteLength(JSON.stringify(loggedRecord))) + RECORD_OVERHEAD_BYTES;
	const maxBatchBytes = maxBatchBytesOf({ limits: config.limits });
	if (encodedBytes > maxBatchBytes)
		throw new PartitionWriterRecordTooLargeError({
			bytes: encodedBytes,
			maxBatchBytes,
		});
	const settlement = createPendingSettlement();
	const committed = settlement.join({ kind: "new" });
	const projectedStates =
		explicitProjectedStates ?? projectedStatesOf({ state: nextState });
	const pending: PendingMutation = {
		pendingKey,
		customerKey,
		projectedSubjectKeys: projectedStates.map((projected) =>
			meteringIdentityToSubjectKey({ identity: projected.identity }),
		),
		mutation,
		nextState,
		durability,
		logsAfter,
		loggedRecord,
		settlement,
		encodedBytes,
		committed,
	};
	for (const [index, projected] of projectedStates.entries()) {
		const subjectKey = pending.projectedSubjectKeys[index];
		if (!subjectKey) continue;
		state.subjects.pin({ subjectKey });
		state.subjects.setState({ subjectKey, state: projected });
	}
	state.pendingByKey.set(pendingKey, pending);
	customerPending.add(pending);
	state.pendingByCustomerKey.set(customerKey, customerPending);
	state.queue.push(pending);
	state.storeCompletion = settlement.waitForStore();
	return pending;
}

/** The customer's part, and the part of the entity the state names. */
const projectedStatesOf = ({ state }: { state: SubjectState }) => {
	const states = splitSubjectState({ state });
	return states.entity ? [states.customer, states.entity] : [states.customer];
};

/** Snapshot at call time: mutations enqueued later must not extend the wait. */
export function pendingCommitsFor({
	state,
	customerKey,
}: {
	state: PartitionWriterState;
	customerKey: string;
}): Promise<CommittedMutation>[] {
	const customerPending = state.pendingByCustomerKey.get(customerKey);
	if (!customerPending) return [];
	const commits: Promise<CommittedMutation>[] = [];
	for (const pending of customerPending) commits.push(pending.committed);
	return commits;
}

export function removePendingMutation({
	state,
	pending,
}: {
	state: PartitionWriterState;
	pending: PendingMutation;
}): void {
	state.pendingByKey.delete(pending.pendingKey);
	// The committed rows stay resident; only the pin that kept them from eviction is released.
	for (const subjectKey of pending.projectedSubjectKeys) {
		state.subjects.unpin({ subjectKey });
	}
	const customerPending = state.pendingByCustomerKey.get(pending.customerKey);
	customerPending?.delete(pending);
	if (customerPending && customerPending.size === 0) {
		state.pendingByCustomerKey.delete(pending.customerKey);
	}
}

export function rejectAllPending({
	state,
	batch,
	error,
}: {
	state: PartitionWriterState;
	batch: readonly PendingMutation[];
	error: Error;
}): void {
	for (const pending of state.pendingByKey.values()) {
		pending.settlement.reject({ error });
	}
	// Log-acknowledged writes have left pendingByKey but still own an unfinished store milestone.
	for (const pending of batch) pending.settlement.reject({ error });
	state.queue.length = 0;
	state.pendingByKey.clear();
	state.pendingByCustomerKey.clear();
	state.subjects.clear();
}
