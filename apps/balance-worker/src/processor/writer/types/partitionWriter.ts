import type {
	MeteringIdentity,
	MutatingCommand,
	MutationEffect,
	MutationRecord,
	MutationSource,
	RowChange,
	SubjectState,
	SubjectStateMutation,
} from "@autumn/balance-engine";
import type {
	ColdStartScope,
	DbControlEdgeConfig,
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { MeteringRecord } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { RecentCommands } from "../recentCommands/types/recentCommands.js";
import type {
	ResidentDrop,
	SubjectMap,
} from "../subjectMap/types/subjectMap.js";
import type { SubjectMapBudget } from "../subjectMap/types/subjectMapBudget.js";
import type { CommitPositionSink } from "./commitPositionSink.js";
import type {
	CommittedMutation,
	DecidedMutation,
	HeldDecision,
	HeldSubmission,
	MutationDurability,
	MutationSubmission,
} from "./mutation.js";

export type PartitionWriter = {
	waitForStore(): Promise<void>;
	snapshotStore(): () => Promise<void>;
	waitForApplies(): Promise<void>;
	decide<Reply>(submission: MutationSubmission<Reply>): DecidedMutation<Reply>;
	decideHeld<Reply>(
		submission: HeldSubmission<Reply>,
	): HeldDecision<Reply> | null;
	decideHeldGroup<Result>(params: {
		identities: MeteringIdentity[];
		decide: () => Result;
	}): {
		result: Result;
		fitsOneAppend: boolean;
	};
	waitForHeldCommit(params: {
		identity: MeteringIdentity;
		commandId: string;
	}): Promise<void>;
	heldBlocker(params: {
		identity: MeteringIdentity;
		commandId: string;
	}): HeldBlocker | null;
	log(params: {
		command: MutatingCommand;
		mutation: SubjectStateMutation;
		source?: MutationSource;
		defersCommit?: boolean;
	}): Promise<void>;
	flushDeferredLogs(): Promise<void>;
	waitForPendingCommits(params: { customerKey: string }): Promise<void>;
	assertCommitsHealthy(): void;
	readFreshestState(params: {
		identity: MeteringIdentity;
	}): SubjectState | null;
	readAppendedThrough(): bigint | null;
	evict(params: { customerKey: string }): Promise<void>;
	evictResident(params: { coldStart: ColdStartScope }): Promise<ResidentDrop>;
	waitForEvicted(params: { customerKey: string }): Promise<void> | null;
	adopt(params: { state: SubjectState; baselineAt?: number }): SubjectState;
	dispose(): void;
};

export type CommitWaits = {
	queuedMs: number | null;
	lingerMs: number;
	storeWaitMs: number;
};

export type CommittedOutcomeAppender = {
	commitCommandOffset?(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void>;
	settleCommandOffset?(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void;
	flushCommandOffsets?(): Promise<void>;
	encodedBytesOf?(params: { record: MeteringRecord }): number;
	appendCommitted(params: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
		waits?: CommitWaits;
	}): Promise<{ baseOffset: bigint }>;
};

export type PartitionWriterContext = {
	stateStore: Pick<
		StateStore,
		| "baseline"
		| "readState"
		| "readOwnState"
		| "readReceipt"
		| "applyDurableMutations"
		| "snapshotQueues"
	>;
	appender: CommittedOutcomeAppender;
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	dbControl?: Pick<EdgeConfigStore<DbControlEdgeConfig>, "get">;
	receiptPolicy: ReceiptPolicy;
	recentCommands: RecentCommands;
	onStateAdvanced?: (params: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}) => void;
	commitPositions?: CommitPositionSink;
	onRecoveryRequired?: (params: { cause: unknown }) => void;
	now?: () => number;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

export type PartitionWriterLimits = {
	maxBatchSize: number;
	maxPendingCommands: number;
	maxPendingCommandsPerCustomer: number;
	maxBatchBytes?: number;
	maxUnappliedBatches?: number;
	subjectMapBudget?: SubjectMapBudget;
	subjectIdleExpiryMs?: number;
	commitLingerMs?: number;
	applyLingerMs?: number;
	maxBatchesPerFlush?: number;
	deferredCommitMs?: number;
};

export type PartitionWriterConfig = {
	topic: string;
	partition: number;
	limits: PartitionWriterLimits;
};

export type PendingSettlement = {
	join(params: { kind: CommittedMutation["kind"] }): Promise<CommittedMutation>;
	settle(params: {
		mutation: MutationRecord;
		state: SubjectState | null;
	}): void;
	waitForLog(): Promise<void>;
	waitForStore(): Promise<void>;
	settleStore(): void;
	rejectCommit(params: { error: unknown }): void;
	reject(params: { error: unknown }): void;
};

export type PendingMutation = {
	pendingKey: string;
	seq: number;
	customerKey: string;
	projectedSubjectKeys: string[];
	mutation: MutationRecord;
	nextState: SubjectState | null;
	durability: MutationDurability;
	effects?: MutationEffect[];
	loggedRecord: MeteringRecord;
	settlement: PendingSettlement | null;
	replyBody?: string;
	heldGroup?: number;
	encodedBytes: number;
	defersCommit: boolean;
	queuedAt: number;
};

export type PartitionWriterState = {
	subjects: SubjectMap;
	pendingByKey: Map<string, PendingMutation>;
	pendingByCustomerKey: Map<string, Set<PendingMutation>>;
	queue: PendingMutation[];
	draining: boolean;
	storeCompletion: Promise<void>;
	unapplied: UnappliedBatch[];
	appending: Promise<void>;
	applyTail: Promise<void>;
	applying: boolean;
	drainScheduled: boolean;
	recoveryError: Error | null;
	appendedThrough: bigint | null;
	lastBatchSize: number;
	lingerWake: (() => void) | null;
	applyWake: (() => void) | null;
	deferredQueued: number;
	deferredCommitTimer: ReturnType<typeof setTimeout> | null;
	deferredCommitDue: boolean;
	lastSeq: number;
	settledSeq: number;
	lastRowSeq: number;
	storedSeq: number;
	storeWaiters: StoreWaiter[];
	heldGroup: number | null;
	lastHeldGroup: number;
	heldGroupBytes: number;
};

export type StoreWaiter = {
	seq: number;
	resolve(): void;
	reject(error: unknown): void;
};

export type UnappliedBatch = {
	batch: PendingMutation[];
	baseOffset: bigint;
	committedAt: number;
};

export type PartitionWriterScope = {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
	state: PartitionWriterState;
};

export type HeldBlocker = "settled_write_in_flight" | "retry_in_flight";
