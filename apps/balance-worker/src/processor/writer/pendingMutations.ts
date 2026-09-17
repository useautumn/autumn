import {
	meteringIdentityToSubjectKey,
	type SubjectState,
	type SubjectStateMutation,
	splitSubjectState,
} from "@autumn/balance-engine";
import type { CommittedMutation } from "./types/mutation.js";
import type {
	PartitionWriterScope,
	PartitionWriterState,
	PendingMutation,
	PendingSettlement,
} from "./types/partitionWriter.js";
import { PartitionWriterCapacityError } from "./writerErrors.js";

export function createPartitionWriterState(): PartitionWriterState {
	return {
		projectedStateBySubjectKey: new Map(),
		pendingByKey: new Map(),
		pendingByCustomerKey: new Map(),
		queue: [],
		draining: false,
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

	function settle({ mutation }: { mutation: SubjectStateMutation }): void {
		for (const { kind, resolvers } of waiters) {
			resolvers.resolve({ kind, mutation });
		}
	}

	function reject({ error }: { error: unknown }): void {
		for (const { resolvers } of waiters) resolvers.reject(error);
	}

	return { join, settle, reject };
}

/** Records the mutation and projects its result per subject, then returns the writer's own settlement promise. */
export function enqueueMutation({
	scope,
	pendingKey,
	customerKey,
	mutation,
	nextState,
}: {
	scope: PartitionWriterScope;
	pendingKey: string;
	customerKey: string;
	mutation: SubjectStateMutation;
	nextState: SubjectState;
}): Promise<CommittedMutation> {
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
		settlement,
		committed,
	};
	for (const [index, projected] of projectedStates.entries()) {
		const subjectKey = pending.projectedSubjectKeys[index];
		if (subjectKey) state.projectedStateBySubjectKey.set(subjectKey, projected);
	}
	state.pendingByKey.set(pendingKey, pending);
	customerPending.add(pending);
	state.pendingByCustomerKey.set(customerKey, customerPending);
	state.queue.push(pending);
	return committed;
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
	const customerPending = state.pendingByCustomerKey.get(pending.customerKey);
	customerPending?.delete(pending);
	if (customerPending && customerPending.size > 0) return;
	// A subject's projection only outlives the customer's last pending mutation.
	state.pendingByCustomerKey.delete(pending.customerKey);
	for (const subjectKey of pending.projectedSubjectKeys) {
		state.projectedStateBySubjectKey.delete(subjectKey);
	}
}

export function rejectAllPending({
	state,
	error,
}: {
	state: PartitionWriterState;
	error: Error;
}): void {
	for (const pending of state.pendingByKey.values()) {
		pending.settlement.reject({ error });
	}
	state.queue.length = 0;
	state.pendingByKey.clear();
	state.pendingByCustomerKey.clear();
	state.projectedStateBySubjectKey.clear();
}
