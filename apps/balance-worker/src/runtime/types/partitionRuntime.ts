import type {
	CheckCommand,
	CheckDecision,
	MeteringIdentity,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { CommittedTrackOutcomeAppender } from "../../writer/committedTrackOutcomeAppender.js";
import type {
	PartitionTrackWriterLimits,
	PartitionTrackWriterReceiptPolicy,
} from "../../writer/partitionTrackWriter.js";
import type { PartitionRuntimeStatus } from "./partitionRuntimeState.js";

export type OwnedPartitionProducer = {
	connect(): Promise<void>;
	fence(): Promise<void>;
	disconnect(): Promise<void>;
};

export type PartitionOutcomeFollowerPort = {
	// Resolve after replay reaches a freshly captured watermark; continue live following until stopped.
	startAndCatchUp(params: {
		topic: string;
		partition: number;
		onUnavailable: RuntimeUnavailableListener;
	}): Promise<void>;
	// Stopping must settle pending catch-up and in-flight replay callbacks.
	stop(): Promise<void>;
};

export type MeteringPartitionResolver = {
	partitionForIdentity(params: { identity: MeteringIdentity }): number;
};

export type PartitionRuntimeDependencies = {
	trackReceiptPolicy: PartitionTrackWriterReceiptPolicy;
	stateStore: SqliteBalanceStateStore;
	producer: OwnedPartitionProducer;
	appender: CommittedTrackOutcomeAppender;
	follower: PartitionOutcomeFollowerPort;
	partitionResolver: MeteringPartitionResolver;
};

export type PartitionRuntimeConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionTrackWriterLimits;
	recoveryDrainTimeoutMs: number;
};

export interface PartitionRuntimeContext extends PartitionRuntimeDependencies {
	config: PartitionRuntimeConfig;
	writer: {
		submitTrack(params: { command: TrackCommand }): Promise<TrackDecision>;
	};
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
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<void>;
	getStatus(): PartitionRuntimeStatus;
	subscribeUnavailable(listener: RuntimeUnavailableListener): () => void;
	submitTrack(params: { command: TrackCommand }): Promise<TrackDecision>;
	check(params: { command: CheckCommand }): Promise<CheckDecision>;
};
