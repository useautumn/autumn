import type { CatalogCache } from "@autumn/catalog-lru";
import type {
	KafkaCommitMode,
	KafkaConsumerGroupTimings,
	KafkaOffsetCommit,
	KafkaProducerFactory,
	KafkaProducerLimits,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";
import type { PartitionCheckpointMaintenance } from "../../checkpoint/scheduling/partitionCheckpointMaintenance.js";
import type { OwnershipHandoffLink } from "../../kafka/createOwnershipHandoffLink.js";
import type { OwnerEpochCell } from "../../kafka/ownerEpochCell.js";
import type { PartitionOwnershipPublication } from "../../partitions/types/partitions.js";
import type { PartitionLoad } from "../../processor/writer/partitionLoad/createPartitionLoad.js";
import type { ProducedOffsets } from "../../processor/writer/producedOffsets/createProducedOffsets.js";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
import type { PartitionWriterLimits } from "../../processor/writer/types/partitionWriter.js";
import type {
	PartitionBootstrapper,
	PartitionBootstrapRetryPolicy,
} from "../../runtime/bootstrap/types/partitionBootstrap.js";
import type {
	MeteringPartitionResolver,
	PartitionOutcomeFollowerPort,
	PartitionRuntime,
} from "../../runtime/types/partitionRuntime.js";
import type { PartitionCheckpointRestoreLimits } from "../../state/actions/checkpoint/restorePartitionCheckpoint.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";

export type KafkaBalanceWorkerTimings = KafkaConsumerGroupTimings & {
	healthRefreshIntervalMs: number;
	recoveryDrainTimeoutMs: number;
};

export type PartitionRuntimeFactoryInput = {
	topic: string;
	partition: number;
	follower: PartitionOutcomeFollowerPort;
	/** Read-only replay of the same partition for preparation; absent in a bare test. */
	preparation?: PartitionOutcomeFollowerPort;
	recentCommands: RecentCommands;
	/** Offsets this runtime's writer produced; its consumer passes them unread. */
	producedOffsets?: ProducedOffsets;
	/** Where the claim's epoch is published; the follower reads it to recognise a fence from above. */
	ownerEpoch?: OwnerEpochCell;
};

export type ConstructedPartitionRuntime = {
	runtime: PartitionRuntime;
	publication: PartitionOwnershipPublication;
};

export type KafkaOwnedPartitionRuntimeFactory = (
	position: PartitionRuntimeFactoryInput,
) => ConstructedPartitionRuntime;

export type PartitionRuntimeFactoryContext = {
	logger?: Pick<AutumnLogger, "debug"> &
		Partial<Pick<AutumnLogger, "error" | "warn">>;
	kafka: KafkaProducerFactory;
	ownershipOffsets: Pick<Admin, "fetchTopicOffsets">;
	ownershipHandoff?: Pick<OwnershipHandoffLink, "tail" | "sender">;
	stateStore: StateStore;
	db: WorkerDb;
	catalogCache: CatalogCache;
	/** Built beside the store: checkpoint restore for sqlite, the Postgres bookmark for postgres. */
	bootstrapper: PartitionBootstrapper;
	checkpointMaintenance?: PartitionCheckpointMaintenance;
	partitionResolver: MeteringPartitionResolver;
	/** Shared by every partition runtime; the consumer group's assigner reads it on each rejoin. */
	partitionLoad?: PartitionLoad;
	/** Commits command offsets through the consumer group when no transaction carries them (idempotent commits). */
	commandOffsets?: { commit(offsets: KafkaOffsetCommit): Promise<void> };
};

export type PartitionRuntimeFactoryConfig = {
	deploymentEnvironment: string;
	commands?: { commandTopic: string; groupId: string };
	ownership: { topic: string; endpoint: string };
	checkpointRestoreLimits: PartitionCheckpointRestoreLimits;
	checkpointRetryPolicy: PartitionBootstrapRetryPolicy;
	writerLimits: PartitionWriterLimits;
	trackReceiptRetentionMs: number;
	producerLimits: KafkaProducerLimits;
	/** Defaults to transactional. */
	commit?: { mode: KafkaCommitMode };
	timings: KafkaBalanceWorkerTimings;
};
