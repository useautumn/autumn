import type { MeteringIdentity } from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { PartitionCheckpointMaintenance } from "../../checkpoint/scheduling/partitionCheckpointMaintenance.js";
import type {
	OwnedPartitionFollowerProgress,
	OwnedPartitionHealth,
} from "../../health/ownedPartitionHealth.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { ReceiptPolicy } from "../../processor/types/receiptPolicy.js";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
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
		/** Skip the dedup window below the bookmark; a preparation follower already rebuilt it. */
		fromBookmark?: boolean;
	}): Promise<void>;
	readProgress(params: {
		topic: string;
		partition: number;
	}): OwnedPartitionFollowerProgress;
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
		>;
	producer: OwnedPartitionProducer;
	appender: CommittedOutcomeAppender;
	follower: PartitionOutcomeFollowerPort;
	/** Read-only: feeds the dedup window before this worker owns the partition. Without one the runtime cannot prepare. */
	preparationFollower?: PartitionOutcomeFollowerPort;
	bootstrapper: PartitionBootstrapper;
	partitionResolver: MeteringPartitionResolver;
	db: WorkerDb;
	catalogCache: CatalogCache;
	receiptPolicy: ReceiptPolicy;
	/** Per partition, shared with `follower`: what the writer applied and what the log replayed. */
	recentCommands: RecentCommands;
	checkpointMaintenance?: PartitionCheckpointMaintenance;
};

export type PartitionRuntimeConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
	recoveryDrainTimeoutMs: number;
	/** How long a command waits for an activating runtime before it is refused. */
	activationWaitMs?: number;
};

export interface PartitionRuntimeContext extends PartitionRuntimeDependencies {
	config: PartitionRuntimeConfig;
	processor: PartitionProcessor;
}

export type RuntimeFailure = { cause: unknown };
export type RuntimeUnavailableListener = (failure: RuntimeFailure) => void;

export type PartitionRuntime = {
	/** Read-only, on the preparation follower: its stop settles before activation starts the real one. */
	prepare(): Promise<void>;
	activate(): Promise<void>;
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<void>;
	getStatus(): PartitionRuntimeStatus;
	getHealth(): OwnedPartitionHealth;
	subscribeUnavailable(listener: RuntimeUnavailableListener): () => void;
	/** Runs one processor command behind the readiness gate and recovery mapping. */
	process<Decision>(
		run: (processor: PartitionProcessor) => Promise<Decision>,
	): Promise<Decision>;
};
