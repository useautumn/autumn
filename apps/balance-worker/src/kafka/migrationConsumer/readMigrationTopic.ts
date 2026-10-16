import type { Kafka } from "kafkajs";

export async function readMigrationTopic({
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
	} catch {
		return undefined;
	} finally {
		await admin.disconnect().catch(() => undefined);
	}
}
