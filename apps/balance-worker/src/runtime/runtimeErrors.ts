export type OwnedPartitionRuntimeStatus =
	| "created"
	| "fencing"
	| "bootstrapping"
	| "catching_up"
	| "ready"
	| "draining"
	| "stopped"
	| "recovery_required";

export class OwnedPartitionNotReadyError extends Error {
	readonly status: PartitionRuntimeStatus;

	constructor({ status }: { status: PartitionRuntimeStatus }) {
		super(`Owned partition runtime is not ready: ${status}`);
		this.name = "OwnedPartitionNotReadyError";
		this.status = status;
	}
}

export class OwnedPartitionMismatchError extends Error {
	constructor({
		customerKey,
		expectedPartition,
		actualPartition,
	}: {
		customerKey: string;
		expectedPartition: number;
		actualPartition: number;
	}) {
		super(
			`${customerKey} does not belong to owned partition ${expectedPartition}; resolved to ${actualPartition}`,
		);
		this.name = "OwnedPartitionMismatchError";
	}
}

export class OwnedPartitionStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Owned partition state not found: ${customerKey}`);
		this.name = "OwnedPartitionStateNotFoundError";
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
