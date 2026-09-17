import type {
	CheckCommand,
	InitializeRequest,
	TrackCommand,
} from "@autumn/balance-engine";
import type {
	CheckReply,
	InitializeReply,
	TrackReply,
} from "@autumn/balance-worker-client/protocol";
import type { CatalogCache } from "../../catalog/types/catalogCache.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { SubjectHydrator } from "../subject/types/subjectHydrator.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriter,
	PartitionWriterContext,
	PartitionWriterLimits,
} from "../writer/types/partitionWriter.js";
import type { ReceiptPolicy } from "./receiptPolicy.js";

/** Processes one partition's accepted commands: track writes, check reads. */
export type PartitionProcessor = {
	track(params: { command: TrackCommand }): Promise<TrackReply>;
	check(params: { command: CheckCommand }): Promise<CheckReply>;
	initialize(params: { request: InitializeRequest }): Promise<InitializeReply>;
	/** Settles every accepted command; the runtime awaits this before disposal. */
	drain(): Promise<void>;
};

export type PartitionProcessorDependencies = {
	stateStore: PartitionWriterContext["stateStore"];
	catalogCache: CatalogCache;
	db: WorkerDb;
	appender: CommittedOutcomeAppender;
	receiptPolicy: ReceiptPolicy;
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
