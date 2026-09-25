import type { PartitionRuntimeStatus } from "./types/partitionRuntimeState.js";

export class OwnedPartitionNotReadyError extends Error {
	readonly status: PartitionRuntimeStatus;

	constructor({ status }: { status: PartitionRuntimeStatus }) {
		super(`Owned partition runtime is not ready: ${status}`);
		this.name = "OwnedPartitionNotReadyError";
		this.status = status;
	}
}

export class OwnedPartitionRecoveryRequiredError extends Error {
	constructor({
		topic,
		partition,
		cause,
	}: {
		topic: string;
		partition: number;
		cause: unknown;
	}) {
		super(`Owned partition ${topic}[${partition}] requires recovery`, {
			cause,
		});
		this.name = "OwnedPartitionRecoveryRequiredError";
	}
}

export class OwnedPartitionProducerFencedError extends OwnedPartitionRecoveryRequiredError {
	constructor({
		topic,
		partition,
		cause,
	}: {
		topic: string;
		partition: number;
		cause: unknown;
	}) {
		super({ topic, partition, cause });
		this.name = "OwnedPartitionProducerFencedError";
		this.message = `Owned partition producer ${topic}[${partition}] was fenced`;
	}
}

/** The partition's log carried a fence from a higher epoch: another worker owns it now, whatever this one still believes. */
export class OwnerEpochSupersededError extends Error {
	readonly retriable = false;
	readonly topic: string;
	readonly partition: number;
	readonly ownEpoch: bigint;
	readonly fenceEpoch: bigint;
	readonly fenceOffset: bigint;
	constructor({
		topic,
		partition,
		ownEpoch,
		fenceEpoch,
		fenceOffset,
	}: {
		topic: string;
		partition: number;
		ownEpoch: bigint;
		fenceEpoch: bigint;
		fenceOffset: bigint;
	}) {
		super(
			`Partition ${topic}[${partition}] was fenced at epoch ${fenceEpoch} (log offset ${fenceOffset}); this worker holds epoch ${ownEpoch}`,
		);
		this.name = "OwnerEpochSupersededError";
		this.topic = topic;
		this.partition = partition;
		this.ownEpoch = ownEpoch;
		this.fenceEpoch = fenceEpoch;
		this.fenceOffset = fenceOffset;
	}
}

function findFencedCause(
	cause: unknown,
): OwnedPartitionProducerFencedError | undefined {
	const pending = [cause];
	const visited = new Set<unknown>();
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === null || typeof current !== "object" || visited.has(current))
			continue;
		if (current instanceof OwnedPartitionProducerFencedError) return current;
		visited.add(current);
		if ("cause" in current) pending.push(current.cause);
		if (current instanceof AggregateError) pending.push(...current.errors);
	}
	return undefined;
}

export function createOwnedPartitionRecoveryError({
	topic,
	partition,
	cause,
}: {
	topic: string;
	partition: number;
	cause: unknown;
}): OwnedPartitionRecoveryRequiredError {
	const fencedCause = findFencedCause(cause);
	return fencedCause
		? new OwnedPartitionProducerFencedError({ topic, partition, cause })
		: new OwnedPartitionRecoveryRequiredError({ topic, partition, cause });
}
