import type { Kafka } from "kafkajs";
import {
	SUBJECT_EVENTS_PARTITIONS,
	SUBJECT_EVENTS_TOPIC,
} from "./subjectEventsTopic.js";
import type { RedpandaContext } from "./types/redpandaContext.js";

// Both the producer and the projector call this on connect. Listing first
// because a broker answers a redundant createTopics with a logged error.
export const ensureSubjectEventsTopic = async ({
	ctx,
	kafka,
}: {
	ctx: RedpandaContext;
	kafka: Kafka;
}): Promise<void> => {
	const admin = kafka.admin();
	await admin.connect();
	try {
		const topics = await admin.listTopics();
		if (topics.includes(SUBJECT_EVENTS_TOPIC)) return;

		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{
					topic: SUBJECT_EVENTS_TOPIC,
					numPartitions: SUBJECT_EVENTS_PARTITIONS,
					replicationFactor: 1,
				},
			],
		});
		ctx.logger.info("Ledger created the subject-events topic", {
			event: "ledger.topic_created",
			data: {
				topic: SUBJECT_EVENTS_TOPIC,
				partitions: SUBJECT_EVENTS_PARTITIONS,
			},
		});
	} finally {
		await admin.disconnect();
	}
};
