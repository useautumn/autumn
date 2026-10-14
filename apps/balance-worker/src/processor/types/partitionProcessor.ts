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
import type {
	ColdStartScope,
	DbControlEdgeConfig,
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { InlineCheckDecision } from "../commands/checkInline.js";
import type { InlineTrackBatchOutcome } from "../commands/trackBatchInline.js";
import type { InlineTrackDecision } from "../commands/trackInline.js";
import type { SubjectHydrator } from "../subject/types/subjectHydrator.js";
import type { RecentCommands } from "../writer/recentCommands/types/recentCommands.js";
import type { ResidentDrop } from "../writer/subjectMap/types/subjectMap.js";
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

export type PartitionProcessor = {
	execute<Decision>(params: {
		source: MutationSource;
		run: (processor: PartitionProcessor) => Promise<Decision>;
		deferredLogs?: DeferredLogSink;
	}): Promise<Decision>;
	track(params: { command: TrackCommand }): Promise<TrackReply>;
	trackInline(params: { command: TrackCommand }): InlineTrackDecision;
	trackBatchInline(params: {
		commands: TrackCommand[];
	}): InlineTrackBatchOutcome;
	decideTrack(params: {
		command: TrackCommand;
	}): Promise<DecidedMutation<never>>;
	check(params: { command: CheckCommand }): Promise<CheckReply>;
	checkInline(params: { command: CheckCommand }): InlineCheckDecision;
	dispose(): void;
	readSubjectState(params: {
		command: ReadSubjectStateCommand;
	}): Promise<ReadSubjectStateReply>;
	initialize(params: { request: InitializeRequest }): Promise<InitializeReply>;
	applyBillingPlan(params: {
		request: ApplyBillingPlanRequest;
	}): Promise<ApplyBillingPlanReply>;
	evict(params: {
		command: EvictCommand;
		waitsForSnapshotDelete?: boolean;
	}): Promise<EvictReply>;
	evictResident(params: { coldStart: ColdStartScope }): Promise<ResidentDrop>;
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
	drain(): Promise<void>;
};

export type PartitionProcessorDependencies = {
	stateStore: PartitionWriterContext["stateStore"] &
		Pick<
			StateStore,
			| "baseline"
			| "readNextOffset"
			| "readCommandNextOffset"
			| "advanceCommandNextOffset"
		>;
	catalogCache: CatalogCache;
	db: WorkerDb;
	appender: CommittedOutcomeAppender;
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	dbControl?: EdgeConfigStore<DbControlEdgeConfig>;
	receiptPolicy: ReceiptPolicy;
	recentCommands: RecentCommands;
	commitPositions?: CommitPositionSink;
	onRecoveryRequired?: PartitionWriterContext["onRecoveryRequired"];
	assertCanRead(): void;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

export type PartitionProcessorConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
	logsEvicts?: boolean;
};

export interface PartitionProcessorContext
	extends PartitionProcessorDependencies {
	config: PartitionProcessorConfig;
	writer: PartitionWriter;
	subjectHydrator: SubjectHydrator;
}

export type AcceptedCommands = {
	active: Set<Promise<unknown>>;
};

export type CustomerPlans = {
	tails: Map<string, Promise<void>>;
};

export type PartitionProcessorScope = {
	ctx: PartitionProcessorContext;
	accepted: AcceptedCommands;
	customerPlans: CustomerPlans;
};
