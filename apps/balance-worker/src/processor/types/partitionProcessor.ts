import type {
	ApplyBillingPlanRequest,
	CheckCommand,
	ConfirmExpiredLockCommand,
	EvictCommand,
	FinalizeCommand,
	FlushCommand,
	InitializeRequest,
	MutationSource,
	ReadSubjectStateCommand,
	ResetCommand,
	TrackCommand,
} from "@autumn/balance-engine";
import type {
	ApplyBillingPlanReply,
	CheckReply,
	ConfirmExpiredLockReply,
	EvictReply,
	FinalizeReply,
	FlushReply,
	InitializeReply,
	ReadSubjectStateReply,
	ResetReply,
	TrackReply,
} from "@autumn/balance-worker-client/protocol";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { SubjectHydrator } from "../subject/types/subjectHydrator.js";
import type { RecentCommands } from "../writer/recentCommands/types/recentCommands.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriter,
	PartitionWriterContext,
	PartitionWriterLimits,
} from "../writer/types/partitionWriter.js";
import type { ReceiptPolicy } from "./receiptPolicy.js";

/** Processes one partition's accepted commands: track writes, check reads. */
export type PartitionProcessor = {
	execute<Decision>(params: {
		source: MutationSource;
		run: (processor: PartitionProcessor) => Promise<Decision>;
	}): Promise<Decision>;
	track(params: { command: TrackCommand }): Promise<TrackReply>;
	check(params: { command: CheckCommand }): Promise<CheckReply>;
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
	confirmExpiredLock(params: {
		command: ConfirmExpiredLockCommand;
	}): Promise<ConfirmExpiredLockReply>;
	reset(params: { command: ResetCommand }): Promise<ResetReply>;
	/** Settles every accepted command; the runtime awaits this before disposal. */
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
};

export type PartitionProcessorConfig = {
	topic: string;
	partition: number;
	writerLimits: PartitionWriterLimits;
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
