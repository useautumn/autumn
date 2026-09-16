export type KafkaRecordPosition = {
	topic: string;
	partition: number;
	offset: bigint;
};
