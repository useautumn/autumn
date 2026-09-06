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
		pendingCountByCustomerKey: new Map(),
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
	const customerCount = state.pendingCountByCustomerKey.get(customerKey) ?? 0;
	if (
		state.pendingByKey.size >= config.limits.maxPendingCommands ||
		customerCount >= config.limits.maxPendingCommandsPerCustomer
	) {
		throw new PartitionWriterCapacityError();
	}
	const settlement = createPendingSettlement();
	const pending: PendingOutcome = {
		pendingKey,
		customerKey,
		outcome,
		settlement,
	};
	state.projectedStateByCustomerKey.set(customerKey, nextState);
	state.pendingByKey.set(pendingKey, pending);
	state.pendingCountByCustomerKey.set(customerKey, customerCount + 1);
	state.queue.push(pending);
	return settlement.join({ kind: "new" });
}

export function removePendingOutcome({
	state,
	pending,
}: {
	state: PartitionWriterState;
	pending: PendingOutcome;
}): void {
	state.pendingByKey.delete(pending.pendingKey);
	const customerCount =
		(state.pendingCountByCustomerKey.get(pending.customerKey) ?? 0) - 1;
	if (customerCount > 0) {
		state.pendingCountByCustomerKey.set(pending.customerKey, customerCount);
		return;
	}
	// The projection only outlives its last pending outcome for that customer.
	state.pendingCountByCustomerKey.delete(pending.customerKey);
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
	state.pendingCountByCustomerKey.clear();
	state.projectedStateByCustomerKey.clear();
}
