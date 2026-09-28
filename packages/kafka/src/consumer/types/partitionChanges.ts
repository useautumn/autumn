export type KafkaPartitionRevocation = {
	causeForPartition(position: { partition: number }): unknown;
};

export interface KafkaPartitionAssignment extends KafkaPartitionRevocation {
	partitions: number[];
}

export type KafkaPartitionChangeListeners = {
	onAssigned(change: KafkaPartitionAssignment): void;
	onRevoked(change: KafkaPartitionRevocation): void;
	/** `restart` is kafkajs's own verdict: false means the consumer is gone for good and nothing rejoins. */
	onCrashed(failure: { cause: unknown; restart: boolean }): void;
	onError(failure: { cause: unknown }): void;
};
