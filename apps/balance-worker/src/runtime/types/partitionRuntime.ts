import type { MeteringIdentity } from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type {
	DbControlEdgeConfig,
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionCheckpointMaintenance } from "../../checkpoint/scheduling/partitionCheckpointMaintenance.js";
import type {
	OwnedPartitionFollowerProgress,
	OwnedPartitionHealth,
} from "../../health/ownedPartitionHealth.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { ReceiptPolicy } from "../../processor/types/receiptPolicy.js";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
import type { CommitPositionSink } from "../../processor/writer/types/commitPositionSink.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriterContext,
	PartitionWriterLimits,
} from "../../processor/writer/types/partitionWriter.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type {
	PartitionBootstrapper,
	PartitionLogRange,
} from "../bootstrap/types/partitionBootstrap.js";
import type { PartitionRuntimeStatus } from "./partitionRuntimeState.js";

export type OwnedPartitionProducer = {
	connect(): Promise<void>;
	fence(): Promise<void>;
	fenceOwnership?(): Promise<{ offset: bigint } | null>;
	disconnect(): Promise<void>;
};

export type PartitionOutcomeFollowerPort = {
	readLogRange(params: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<PartitionLogRange>;
	startAndCatchUp(params: {
		topic: string;
		partition: number;
		targetNextOffset: bigint;
		onUnavailable: RuntimeUnavailableListener;
		fromBookmark?: boolean;
	}): Promise<void>;
	readProgress(params: {
		topic: string;
		partition: number;
	}): OwnedPartitionFollowerProgress;
	awaitNextOffset?(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
		signal?: AbortSignal;
	}): Promise<void>;
	stop(): Promise<void>;
};

export type MeteringPartitionResolver = {
	partitionForIdentity(params: { identity: MeteringIdentity }): number;
};

export type PartitionRuntimeDependencies = {
	stateStore: PartitionWriterContext["stateStore"] &
		Pick<
			StateStore,
			| "readNextOffset"
			| "baseline"
			| "readCommandNextOffset"
			| "advanceCommandNextOffset"
			| "claimPartition"
		>;
	producer: OwnedPartitionProducer;
	appender: CommittedOutcomeAppender;
	follower: PartitionOutcomeFollowerPort;
	preparationFollower?: PartitionOutcomeFollowerPort;
	bootstrapper: PartitionBootstrapper;
	partitionResolver: MeteringPartitionResolver;
	db: WorkerDb;
	catalogCache: CatalogCache;
	logger?: Partial<Pick<AutumnLogger, "warn" | "info">>;
	receiptPolicy: ReceiptPolicy;
	recentCommands: RecentCommands;
	commitPositions?: CommitPositionSink;
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	dbControl?: EdgeConfigStore<DbControlEdgeConfig>;
	checkpointMaintenance?: PartitionCheckpointMaintenance;
};

export type PartitionRuntimeConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
	recoveryDrainTimeoutMs: number;
	activationWaitMs?: number;
};

export interface PartitionRuntimeContext extends PartitionRuntimeDependencies {
	config: PartitionRuntimeConfig;
	processor: PartitionProcessor;
}

export type RuntimeFailure = { cause: unknown };
export type RuntimeUnavailableListener = (failure: RuntimeFailure) => void;

export type PartitionRuntime = {
	prepare(): Promise<void>;
	activate(): Promise<void>;
	fence(): Promise<void>;
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<void>;
	getStatus(): PartitionRuntimeStatus;
	getHealth(): OwnedPartitionHealth;
	subscribeUnavailable(listener: RuntimeUnavailableListener): () => void;
	process<Decision>(
		run: (processor: PartitionProcessor) => Promise<Decision>,
		options?: ProcessOptions,
	): Promise<Decision>;
	processInline<Decision>(
		run: (processor: PartitionProcessor) => Decision | null,
	): Decision | null;
};

export type ProcessOptions = { budgetMs?: number };
