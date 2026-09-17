import type { CustomerMeteringState } from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { CommittedMutation } from "./types/mutation.js";
import type {
	PartitionWriterScope,
	PartitionWriterState,
	PendingOutcome,
	PendingSettlement,
} from "./types/partitionWriter.js";
import { PartitionWriterCapacityError } from "./writerErrors.js";

export function createPartitionWriterState(): PartitionWriterState {
	return {
		projectedStateByCustomerKey: new Map(),
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

	function settle({ outcome }: { outcome: MeteringRecord }): void {
		for (const { kind, resolvers } of waiters) {
			resolvers.resolve({ kind, outcome });
		}
	}

	function reject({ error }: { error: unknown }): void {
		for (const { resolvers } of waiters) resolvers.reject(error);
	}

	return { join, settle, reject };
}

/** Records the outcome and its projection, then returns the writer's own settlement promise. */
export function enqueueOutcome({
	scope,
	pendingKey,
	customerKey,
	outcome,
	nextState,
}: {
	scope: PartitionWriterScope;
	pendingKey: string;
	customerKey: string;
	outcome: MeteringRecord;
	nextState: CustomerMeteringState;
}): Promise<CommittedMutation> {
	const { state, config } = scope;
	const customerPending =
		state.pendingByCustomerKey.get(customerKey) ?? new Set<PendingOutcome>();
	if (
		state.pendingByKey.size >= config.limits.maxPendingCommands ||
		customerPending.size >= config.limits.maxPendingCommandsPerCustomer
	) {
		throw new PartitionWriterCapacityError();
	}
	const settlement = createPendingSettlement();
	const committed = settlement.join({ kind: "new" });
	const pending: PendingOutcome = {
		pendingKey,
		customerKey,
		outcome,
		settlement,
		committed,
	};
	state.projectedStateByCustomerKey.set(customerKey, nextState);
	state.pendingByKey.set(pendingKey, pending);
	customerPending.add(pending);
	state.pendingByCustomerKey.set(customerKey, customerPending);
	state.queue.push(pending);
	return committed;
}

/** Snapshot at call time: outcomes enqueued later must not extend the wait. */
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

export function removePendingOutcome({
	state,
	pending,
}: {
	state: PartitionWriterState;
	pending: PendingOutcome;
}): void {
	state.pendingByKey.delete(pending.pendingKey);
	const customerPending = state.pendingByCustomerKey.get(pending.customerKey);
	customerPending?.delete(pending);
	if (customerPending && customerPending.size > 0) return;
	// The projection only outlives its last pending outcome for that customer.
	state.pendingByCustomerKey.delete(pending.customerKey);
	state.projectedStateByCustomerKey.delete(pending.customerKey);
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
	state.projectedStateByCustomerKey.clear();
}
