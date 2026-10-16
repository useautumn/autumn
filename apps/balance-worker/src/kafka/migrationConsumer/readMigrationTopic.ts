import type { Kafka } from "kafkajs";

const READ_ATTEMPTS = 5;
const READ_RETRY_MS = 2_000;

export async function readMigrationTopic({
	kafka,
	topic,
	partitionCount,
}: {
	kafka: Pick<Kafka, "admin">;
	topic: string;
	partitionCount: number;
}): Promise<string | undefined> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await readTopicOnce({ kafka, topic, partitionCount });
		} catch (cause) {
			if (attempt >= READ_ATTEMPTS) throw cause;
			await Bun.sleep(READ_RETRY_MS);
		}
	}
}

async function readTopicOnce({
	kafka,
	topic,
	partitionCount,
}: {
	kafka: Pick<Kafka, "admin">;
	topic: string;
	partitionCount: number;
}): Promise<string | undefined> {
	const admin = kafka.admin();
	try {
		await admin.connect();
		const topics = await admin.listTopics();
		if (!topics.includes(topic)) return undefined;
		const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
		const partitions = metadata.topics.find(({ name }) => name === topic)
			?.partitions.length;
		return partitions === partitionCount ? topic : undefined;
	} finally {
		await admin.disconnect().catch(() => undefined);
	}
}
