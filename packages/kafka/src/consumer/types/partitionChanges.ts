export type KafkaPartitionRevocation = {
	causeForPartition(position: { partition: number }): unknown;
};

export interface KafkaPartitionAssignment extends KafkaPartitionRevocation {
	partitions: number[];
}

export type KafkaPartitionChangeListeners = {
	onAssigned(change: KafkaPartitionAssignment): void;
	onRevoked(change: KafkaPartitionRevocation): void;
	onCrashed(failure: { cause: unknown }): void;
	onError(failure: { cause: unknown }): void;
};
