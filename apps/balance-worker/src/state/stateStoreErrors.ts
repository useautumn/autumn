export class UnsupportedBalanceStateSchemaVersionError extends Error {
	constructor({ version }: { version: bigint }) {
		super(`Unsupported balance state schema version: ${version}`);
		this.name = "UnsupportedBalanceStateSchemaVersionError";
	}
}

export class PartitionProgressNotFoundError extends Error {
	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Partition progress not found for ${topic}[${partition}]`);
		this.name = "PartitionProgressNotFoundError";
	}
}

export class MeteringStatePartitionMismatchError extends Error {
	constructor({ partitionKey }: { partitionKey: string }) {
		super(`Metering state ${partitionKey} belongs to another Kafka partition`);
		this.name = "MeteringStatePartitionMismatchError";
	}
}

export class ConflictingPartitionInitializationError extends Error {
	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Partition ${topic}[${partition}] is already initialized`);
		this.name = "ConflictingPartitionInitializationError";
	}
}

/** The same mutation id was reused for a different request. */
export class ConflictingMutationReceiptError extends Error {
	constructor({
		partitionKey,
		mutationId,
	}: {
		partitionKey: string;
		mutationId: string;
	}) {
		super(
			`Mutation ${mutationId} for ${partitionKey} carries a different request`,
		);
		this.name = "ConflictingMutationReceiptError";
	}
}

export class CorruptBalanceStateError extends Error {
	constructor({ partitionKey }: { partitionKey: string }) {
		super(`Stored balance state is corrupt for ${partitionKey}`);
		this.name = "CorruptBalanceStateError";
	}
}

export class UnexpectedKafkaOffsetError extends Error {
	readonly expectedOffset: bigint;
	readonly receivedOffset: bigint;

	constructor({
		topic,
		partition,
		expectedOffset,
		receivedOffset,
	}: {
		topic: string;
		partition: number;
		expectedOffset: bigint;
		receivedOffset: bigint;
	}) {
		super(
			`Expected ${topic}[${partition}] offset ${expectedOffset}, received ${receivedOffset}`,
		);
		this.name = "UnexpectedKafkaOffsetError";
		this.expectedOffset = expectedOffset;
		this.receivedOffset = receivedOffset;
	}
}
