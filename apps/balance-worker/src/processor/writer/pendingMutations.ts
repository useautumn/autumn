import {
	type Catalog,
	type MutationRecord,
	meteringIdentityToSubjectKey,
	type SubjectState,
	splitSubjectState,
} from "@autumn/balance-engine";
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
import { PartitionWriterCapacityError } from "./writerErrors.js";

export function createPartitionWriterState(): PartitionWriterState {
	return {
		subjects: createSubjectMap(),
		pendingByKey: new Map(),
		pendingByCustomerKey: new Map(),
		queue: [],
		draining: false,
		storeCompletion: Promise.resolve(),
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

/** A queued mutation owns both durability milestones, even after its log reply releases its pins. */
export function enqueueMutation({
	scope,
	pendingKey,
	customerKey,
	mutation,
	nextState,
	durability,
	catalog,
}: {
	scope: PartitionWriterScope;
	pendingKey: string;
	customerKey: string;
	mutation: MutationRecord;
	nextState: SubjectState;
	durability: MutationDurability;
	catalog?: Catalog;
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
	const settlement = createPendingSettlement();
	const committed = settlement.join({ kind: "new" });
	const states = splitSubjectState({ state: nextState });
	const projectedStates = states.entity
		? [states.customer, states.entity]
		: [states.customer];
	const pending: PendingMutation = {
		pendingKey,
		customerKey,
		projectedSubjectKeys: projectedStates.map((projected) =>
			meteringIdentityToSubjectKey({ identity: projected.identity }),
		),
		mutation,
		nextState,
		durability,
		catalog,
		settlement,
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
