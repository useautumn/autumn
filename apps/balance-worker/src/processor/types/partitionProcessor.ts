import type {
	CheckCommand,
	ConfirmExpiredLockCommand,
	EvictCommand,
	FinalizeCommand,
	InitializeRequest,
	MutationSource,
	TrackCommand,
} from "@autumn/balance-engine";
import type {
	CheckReply,
	ConfirmExpiredLockReply,
	EvictReply,
	FinalizeReply,
	InitializeReply,
	TrackReply,
} from "@autumn/balance-worker-client/protocol";
import type { CatalogCache } from "../../catalog/types/catalogCache.js";
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
	initialize(params: { request: InitializeRequest }): Promise<InitializeReply>;
	evict(params: { command: EvictCommand }): Promise<EvictReply>;
	finalize(params: { command: FinalizeCommand }): Promise<FinalizeReply>;
	confirmExpiredLock(params: {
		command: ConfirmExpiredLockCommand;
	}): Promise<ConfirmExpiredLockReply>;
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

export type PartitionProcessorScope = {
	ctx: PartitionProcessorContext;
	accepted: AcceptedCommands;
};
