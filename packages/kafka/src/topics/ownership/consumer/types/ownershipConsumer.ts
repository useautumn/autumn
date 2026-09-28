import type { Admin, ConsumerConfig } from "kafkajs";
import type { KafkaConsumerGroupTimings } from "../../../../client/types/kafkaLimits.js";
import type {
	KafkaConsumerClient,
	TopicConsumer,
} from "../../../../consumer/types/consumer.js";
import type { ProgressTracker } from "../../../../consumer/types/progress.js";
import type { OwnershipRecord } from "../../types/ownershipRecord.js";
import type { PartitionOwner } from "../../types/partitionOwner.js";

export type OwnershipConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	findOwner(params: { partition: number }): PartitionOwner | undefined;
	refresh(): Promise<void>;
};

export type OwnershipLogEntry = {
	partition: number;
	offset: bigint;
	record: OwnershipRecord;
};

export type OwnershipAdmin = Pick<
	Admin,
	"connect" | "disconnect" | "fetchTopicOffsets"
>;
export type OwnershipKafka = {
	consumer(config: ConsumerConfig): KafkaConsumerClient;
	admin(): OwnershipAdmin;
};
export type OwnershipConsumerConfig = {
	topic: string;
	groupIdPrefix?: string;
	catchUpTimeoutMs?: number;
	timings?: KafkaConsumerGroupTimings;
};
export type OwnershipConsumerContext = {
	consumer: KafkaConsumerClient;
	admin: OwnershipAdmin;
	topicConsumer: TopicConsumer;
	progress: ProgressTracker;
	topic: string;
	catchUpTimeoutMs: number;
};
export type OwnershipConsumerState = {
	status: "created" | "starting" | "started" | "failed" | "stopped";
	owners: Map<number, PartitionOwner>;
	lastAppliedOffsets: Map<number, bigint>;
	lifetime: AbortController;
	starting?: Promise<void>;
	refreshing?: Promise<void>;
	stopping?: Promise<void>;
	closing?: Promise<void>;
	removeCrashListener?: () => void;
};
