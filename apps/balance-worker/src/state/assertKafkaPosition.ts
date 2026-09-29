export const assertTopic = ({ topic }: { topic: string }) => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
};

export const assertPartition = ({ partition }: { partition: number }) => {
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
};

export const assertOffset = ({ offset }: { offset: bigint }) => {
	if (offset < 0n) throw new RangeError(`Invalid Kafka offset: ${offset}`);
};
