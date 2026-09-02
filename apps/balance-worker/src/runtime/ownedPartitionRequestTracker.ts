import type { TrackDecision } from "@autumn/balance-engine";

export class OwnedPartitionRequestTracker {
	private readonly activeOperations = new Set<Promise<unknown>>();
	private readonly trackOperationsByCustomerKey = new Map<
		string,
		Set<Promise<TrackDecision>>
	>();

	register<Result>({
		operation,
	}: {
		operation: Promise<Result>;
	}): Promise<Result> {
		this.activeOperations.add(operation);
		const complete = (): void => {
			this.activeOperations.delete(operation);
		};
		operation.then(complete, complete);
		return operation;
	}

	registerTrack({
		customerKey,
		operation,
	}: {
		customerKey: string;
		operation: Promise<TrackDecision>;
	}): Promise<TrackDecision> {
		const customerOperations =
			this.trackOperationsByCustomerKey.get(customerKey) ?? new Set();
		customerOperations.add(operation);
		this.trackOperationsByCustomerKey.set(customerKey, customerOperations);
		const complete = (): void => {
			customerOperations.delete(operation);
			if (customerOperations.size === 0) {
				this.trackOperationsByCustomerKey.delete(customerKey);
			}
		};
		operation.then(complete, complete);
		return this.register({ operation });
	}

	precedingTracks({
		customerKey,
	}: {
		customerKey: string;
	}): Promise<TrackDecision>[] {
		return [...(this.trackOperationsByCustomerKey.get(customerKey) ?? [])];
	}

	async drain(): Promise<void> {
		await Promise.allSettled([...this.activeOperations]);
	}
}
