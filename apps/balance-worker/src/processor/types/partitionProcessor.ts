import type {
	ApplyBillingPlanRequest,
	CheckCommand,
	ConfirmExpiredLockCommand,
	DeleteBalanceCommand,
	EvictCommand,
	FinalizeCommand,
	FlushCommand,
	InitializeRequest,
	MutationSource,
	ReadSubjectStateCommand,
	RecalculateBalanceCommand,
	ResetCommand,
	TrackCommand,
	UpdateBalanceCommand,
} from "@autumn/balance-engine";
import type {
	ApplyBillingPlanReply,
	CheckReply,
	ConfirmExpiredLockReply,
	DeleteBalanceReply,
	EvictReply,
	FinalizeReply,
	FlushReply,
	InitializeReply,
	ReadSubjectStateReply,
	RecalculateBalanceReply,
	ResetReply,
	TrackReply,
	UpdateBalanceReply,
} from "@autumn/balance-worker-client/protocol";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { EdgeConfigStore } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { SubjectSnapshotsEdgeConfig } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { InlineCheckDecision } from "../commands/checkInline.js";
import type { InlineTrackBatchOutcome } from "../commands/trackBatchInline.js";
import type { InlineTrackDecision } from "../commands/trackInline.js";
import type { SubjectHydrator } from "../subject/types/subjectHydrator.js";
import type { RecentCommands } from "../writer/recentCommands/types/recentCommands.js";
import type { CommitPositionSink } from "../writer/types/commitPositionSink.js";
import type { DecidedMutation } from "../writer/types/mutation.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriter,
	PartitionWriterContext,
	PartitionWriterLimits,
} from "../writer/types/partitionWriter.js";
import type { DeferredLogSink } from "./deferredLogSink.js";
import type { ReceiptPolicy } from "./receiptPolicy.js";

/** Processes one partition's accepted commands: track writes, check reads. */
export type PartitionProcessor = {
	execute<Decision>(params: {
		source: MutationSource;
		run: (processor: PartitionProcessor) => Promise<Decision>;
		deferredLogs?: DeferredLogSink;
	}): Promise<Decision>;
	track(params: { command: TrackCommand }): Promise<TrackReply>;
	/** Decided now, reply held by commit position; refused hands it to `track`. */
	trackInline(params: { command: TrackCommand }): InlineTrackDecision;
	/** A batch decided inline whole, its reply held on its last write; refused hands it to `track` per command. */
	trackBatchInline(params: {
		commands: TrackCommand[];
	}): InlineTrackBatchOutcome;
	/** The track's deduction, enqueued in arrival order; the commit is the caller's to wait for. */
	decideTrack(params: {
		command: TrackCommand;
	}): Promise<DecidedMutation<never>>;
	check(params: { command: CheckCommand }): Promise<CheckReply>;
	/** Decided now on a resident, current subject; refused hands it to `check`. */
	checkInline(params: { command: CheckCommand }): InlineCheckDecision;
	/** Releases what the partition held on the worker: its budget share and its resident rows. */
	dispose(): void;
	readSubjectState(params: {
		command: ReadSubjectStateCommand;
	}): Promise<ReadSubjectStateReply>;
	initialize(params: { request: InitializeRequest }): Promise<InitializeReply>;
	applyBillingPlan(params: {
		request: ApplyBillingPlanRequest;
	}): Promise<ApplyBillingPlanReply>;
	evict(params: { command: EvictCommand }): Promise<EvictReply>;
	flush(params: { command: FlushCommand }): Promise<FlushReply>;
	finalize(params: { command: FinalizeCommand }): Promise<FinalizeReply>;
	decideFinalize(params: {
		command: FinalizeCommand;
	}): Promise<DecidedMutation<never>>;
	confirmExpiredLock(params: {
		command: ConfirmExpiredLockCommand;
	}): Promise<ConfirmExpiredLockReply>;
	reset(params: { command: ResetCommand }): Promise<ResetReply>;
	decideReset(params: {
		command: ResetCommand;
	}): Promise<DecidedMutation<ResetReply>>;
	updateBalance(params: {
		command: UpdateBalanceCommand;
	}): Promise<UpdateBalanceReply>;
	decideUpdateBalance(params: {
		command: UpdateBalanceCommand;
	}): Promise<DecidedMutation<UpdateBalanceReply>>;
	deleteBalance(params: {
		command: DeleteBalanceCommand;
	}): Promise<DeleteBalanceReply>;
	recalculateBalance(params: {
		command: RecalculateBalanceCommand;
	}): Promise<RecalculateBalanceReply>;
	/** Settles every accepted command and the store applies behind them; the runtime awaits this before disposal. */
	drain(): Promise<void>;
};

export type PartitionProcessorDependencies = {
	stateStore: PartitionWriterContext["stateStore"] &
		Pick<
			StateStore,
			"baseline" | "readCommandNextOffset" | "advanceCommandNextOffset"
		>;
	catalogCache: CatalogCache;
	db: WorkerDb;
	appender: CommittedOutcomeAppender;
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	receiptPolicy: ReceiptPolicy;
	recentCommands: RecentCommands;
	/** Where the partition's writer publishes its commit position. */
	commitPositions?: CommitPositionSink;
	assertCanRead(): void;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

export type PartitionProcessorConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
	/** Overrides the BALANCE_WORKER_EVICTS_LOGGED constant; tests exercise both. */
	logsEvicts?: boolean;
};

export interface PartitionProcessorContext
	extends PartitionProcessorDependencies {
	config: PartitionProcessorConfig;
	writer: PartitionWriter;
	subjectHydrator: SubjectHydrator;
}

/** Commands still in flight, so drain can settle them before the runtime disposes. */
export type AcceptedCommands = {
	active: Set<Promise<unknown>>;
};

/** Plans of one customer, queued by customer key: each one is decided and stored before the next starts. */
export type CustomerPlans = {
	tails: Map<string, Promise<void>>;
};

export type PartitionProcessorScope = {
	ctx: PartitionProcessorContext;
	accepted: AcceptedCommands;
	customerPlans: CustomerPlans;
};
