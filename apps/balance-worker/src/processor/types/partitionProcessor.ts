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
import type { AutumnLogger } from "@autumn/logging";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { TrackRunCounters, TrackRuns } from "../runs/createTrackRuns.js";
import type {
	QueuedTrackEntry,
	QueuedTrackOutcome,
} from "../runs/executeQueuedTrackRun.js";
import type {
	SubjectDecisionCounters,
	SubjectDecisions,
} from "../subject/subjectDecisions/types/subjectDecisions.js";
import type { SubjectHydrator } from "../subject/types/subjectHydrator.js";
import type { RecentCommands } from "../writer/recentCommands/types/recentCommands.js";
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
	/** `grantLane` names the server task asking for a track grant; absent, none is given. */
	track(params: {
		command: TrackCommand;
		grantLane?: string;
	}): Promise<TrackReply>;
	/** The track's deduction, enqueued in arrival order; the commit is the caller's to wait for. */
	decideTrack(params: {
		command: TrackCommand;
	}): Promise<DecidedMutation<never>>;
	check(params: { command: CheckCommand }): Promise<CheckReply>;
	/** Consecutive queued tracks for one subject, decided as one run; the ones it could not decide come back to apply alone. */
	executeQueuedTracks(params: {
		entries: QueuedTrackEntry[];
	}): Promise<QueuedTrackOutcome[]>;
	/** Releases what the partition held on the worker: its budget share and its resident rows. */
	dispose(): void;
	/** What the partition counted since it started; partition health reports them. */
	readCounters(): SubjectDecisionCounters & TrackRunCounters;
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
	receiptPolicy: ReceiptPolicy;
	recentCommands: RecentCommands;
	assertCanRead(): void;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

export type PartitionProcessorConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
	/** Off decides every track on a fresh view with every effect: the reference the carried path must equal. */
	carriesTrackContexts?: boolean;
	/** Off decides every sync track alone: the reference a run of tracks must equal. */
	decidesTrackRuns?: boolean;
	/** On, a run's replies share the subject as the run left it rather than as each track left it. */
	sharesRunSnapshot?: boolean;
	/** Off answers every check without a lease, so servers ask the owner each time. */
	issuesCheckLeases?: boolean;
	/** On, a sync track from a lane may carry a grant to answer the key's next tracks at the server; off by default. */
	grantsTracks?: boolean;
	/** Overrides the BALANCE_WORKER_EVICTS_LOGGED constant; tests exercise both. */
	logsEvicts?: boolean;
};

export interface PartitionProcessorContext
	extends PartitionProcessorDependencies {
	config: PartitionProcessorConfig;
	writer: PartitionWriter;
	subjectHydrator: SubjectHydrator;
	subjectDecisions: SubjectDecisions;
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
	/** Absent, every sync track is decided alone. */
	trackRuns?: TrackRuns;
};
