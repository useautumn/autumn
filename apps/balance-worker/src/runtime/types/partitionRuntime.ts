import type {
	CheckCommand,
	CheckDecision,
	MeteringIdentity,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type {
	OwnedPartitionFollowerProgress,
	OwnedPartitionHealth,
} from "../../health/ownedPartitionHealth.js";
import type { TrackReceiptPolicy } from "../../processor/commands/track.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriter,
	PartitionWriterLimits,
} from "../../processor/writer/types/partitionWriter.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
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
	stateStore: SqliteBalanceStateStore;
	producer: OwnedPartitionProducer;
	appender: CommittedOutcomeAppender;
	follower: PartitionOutcomeFollowerPort;
	bootstrapper: PartitionBootstrapper;
	partitionResolver: MeteringPartitionResolver;
	trackReceiptPolicy: TrackReceiptPolicy;
};

export type PartitionRuntimeConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
	recoveryDrainTimeoutMs: number;
};

export interface PartitionRuntimeContext extends PartitionRuntimeDependencies {
	config: PartitionRuntimeConfig;
	writer: PartitionWriter;
	requestTracker: RuntimeRequestTracker;
}

export type RuntimeFailure = { cause: unknown };
export type RuntimeUnavailableListener = (failure: RuntimeFailure) => void;

export interface RuntimeRequestTracker {
	register<Result>(params: { operation: Promise<Result> }): Promise<Result>;
	registerTrack(params: {
		customerKey: string;
		operation: Promise<TrackDecision>;
	}): Promise<TrackDecision>;
	precedingTracks(params: { customerKey: string }): Promise<TrackDecision>[];
	drain(): Promise<void>;
}

export type PartitionRuntime = {
	// A preparation source must own its reader: stop settles all writes before activation reuses SQLite.
	prepare(params: { follower: PartitionOutcomeFollowerPort }): Promise<void>;
	activate(): Promise<void>;
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<void>;
	getStatus(): PartitionRuntimeStatus;
	getHealth(): OwnedPartitionHealth;
	subscribeUnavailable(listener: RuntimeUnavailableListener): () => void;
	submitTrack(params: { command: TrackCommand }): Promise<TrackDecision>;
	check(params: { command: CheckCommand }): Promise<CheckDecision>;
};
