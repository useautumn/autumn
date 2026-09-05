export {
	InvalidKafkaOffsetError,
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "./client/kafkaErrors.js";
export {
	metadataToBaseOffset,
	parseKafkaOffset,
} from "./client/kafkaOffsetUtils.js";
export type {
	KafkaProducer,
	KafkaTransaction,
} from "./client/types/kafkaClient.js";
export { KafkaPartitionOffsetsNotFoundError } from "./consumer/consumerErrors.js";
export { createProgressTracker } from "./consumer/createProgressTracker.js";
export { createTopicConsumer } from "./consumer/createTopicConsumer.js";
export {
	readPartitionLogRange,
	readTopicHighWatermarks,
} from "./consumer/partitionOffsets.js";
export { createPartitionReader } from "./consumer/reader/createPartitionReader.js";
export type {
	PartitionLogRecord,
	PartitionReader,
	PartitionReaderConfig,
	PartitionReaderKafka,
	PartitionReadRange,
} from "./consumer/reader/types/reader.js";
export type {
	KafkaConsumerClient,
	TopicConsumer,
	TopicConsumerConfig,
	TopicConsumerDependencies,
	TopicRecord,
	TopicRecordHandler,
	TopicRecordResult,
	TopicResumePosition,
} from "./consumer/types/consumer.js";
export type {
	PartitionLogRange,
	PartitionPosition,
	PartitionProgress,
	ProgressPosition,
	ProgressTracker,
	ProgressWait,
} from "./consumer/types/progress.js";
export {
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "./lib/recordErrors.js";
export type { TopicSchema } from "./lib/types/topicSchema.js";
export { sendTransactionalBatch } from "./producer/sendTransactionalBatch.js";
export { createMeteringConsumer } from "./topics/metering/consumer/createMeteringConsumer.js";
export { createMeteringReader } from "./topics/metering/consumer/createMeteringReader.js";
export type {
	MeteringConsumerDependencies,
	MeteringRecordApplication,
	MeteringRecordFailure,
	MeteringRecordHandler,
} from "./topics/metering/consumer/types/meteringConsumer.js";
export type {
	MeteringLogEntry,
	MeteringReader,
} from "./topics/metering/consumer/types/meteringReader.js";
export {
	meteringTopic,
	parseMeteringRecord,
	parseMeteringTrackOutcome,
	serializeMeteringRecord,
} from "./topics/metering/meteringTopic.js";
export { createMeteringPublisher } from "./topics/metering/publisher/createMeteringPublisher.js";
export type {
	MeteringAppend,
	MeteringPublisher,
	MeteringPublisherContext,
} from "./topics/metering/publisher/types/meteringPublisher.js";
export type { MeteringRecord } from "./topics/metering/types/meteringRecord.js";
