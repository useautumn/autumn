import type { Admin, Consumer, Kafka } from "kafkajs";
import type { PartitionLag } from "../../internal/projector/types/partitionLag.js";
import type { SubjectEventBatch } from "../../internal/projector/types/subjectEventBatch.js";
import type { SubjectEventConsumer } from "../../internal/projector/types/subjectEventConsumer.js";
import { createKafka } from "./createKafka.js";
import { ensureSubjectEventsTopic } from "./ensureSubjectEventsTopic.js";
import { kafkaBatchToSubjectEventBatch } from "./kafkaBatchToSubjectEventBatch.js";
import { SUBJECT_EVENTS_TOPIC } from "./subjectEventsTopic.js";
import type { RedpandaContext } from "./types/redpandaContext.js";

export const PROJECTOR_GROUP_ID = "ledger-projector";

const NOTHING_COMMITTED = -1;

type OnBatch = (params: { batch: SubjectEventBatch }) => Promise<void>;

const startConsuming = async ({
	ctx,
	kafka,
	consumer,
	admin,
	onBatch,
}: {
	ctx: RedpandaContext;
	kafka: Kafka;
	consumer: Consumer;
	admin: Admin;
	onBatch: OnBatch;
}): Promise<void> => {
	await ensureSubjectEventsTopic({ ctx, kafka });
	await admin.connect();
	await consumer.connect();
	await consumer.subscribe({
		topic: SUBJECT_EVENTS_TOPIC,
		fromBeginning: true,
	});

	await consumer.run({
		autoCommit: false,
		eachBatch: async ({
			batch,
			resolveOffset,
			commitOffsetsIfNecessary,
			heartbeat,
			isRunning,
			isStale,
		}) => {
			if (!isRunning() || isStale()) return;

			await onBatch({ batch: kafkaBatchToSubjectEventBatch({ batch }) });

			// Offsets move only after the transactions committed, in log order:
			// a crash replays the batch, it never skips it.
			for (const message of batch.messages) resolveOffset(message.offset);
			await commitOffsetsIfNecessary();
			await heartbeat();
		},
	});
};

const readLag = async ({
	admin,
	groupId,
}: {
	admin: Admin;
	groupId: string;
}): Promise<PartitionLag[]> => {
	const [groupOffsets, topicOffsets] = await Promise.all([
		admin.fetchOffsets({ groupId, topics: [SUBJECT_EVENTS_TOPIC] }),
		admin.fetchTopicOffsets(SUBJECT_EVENTS_TOPIC),
	]);

	const committedByPartition = new Map(
		groupOffsets
			.flatMap((topic) => topic.partitions)
			.map((partition) => [partition.partition, Number(partition.offset)]),
	);

	return topicOffsets.map(({ partition, offset }) => {
		const latest = Number(offset);
		const committed = committedByPartition.get(partition) ?? NOTHING_COMMITTED;
		return {
			partition,
			committed,
			latest,
			lag: committed === NOTHING_COMMITTED ? latest : latest - committed,
		};
	});
};

export const createSubjectEventConsumer = ({
	ctx,
	groupId,
}: {
	ctx: RedpandaContext;
	groupId: string;
}): SubjectEventConsumer => {
	const kafka = createKafka({ ctx });
	const consumer = kafka.consumer({ groupId });
	const admin = kafka.admin();

	const stop = async (): Promise<void> => {
		await consumer.disconnect();
		await admin.disconnect();
	};

	return {
		start: ({ onBatch }) =>
			startConsuming({ ctx, kafka, consumer, admin, onBatch }),
		readLag: () => readLag({ admin, groupId }),
		stop,
	};
};
