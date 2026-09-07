import type {
	CheckCommand,
	CheckDecision,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { TrackReceiptPolicy } from "../commands/track.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriter,
	PartitionWriterLimits,
} from "../writer/types/partitionWriter.js";

/** Processes one partition's accepted commands: track writes, check reads. */
export type PartitionProcessor = {
	track(params: { command: TrackCommand }): Promise<TrackDecision>;
	check(params: { command: CheckCommand }): Promise<CheckDecision>;
	/** Settles every accepted command; the runtime awaits this before disposal. */
	drain(): Promise<void>;
};

export type PartitionProcessorDependencies = {
	stateStore: Pick<
		SqliteBalanceStateStore,
		"readState" | "readTrackReceipt" | "applyDurableMutations"
	>;
	appender: CommittedOutcomeAppender;
	trackReceiptPolicy: TrackReceiptPolicy;
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
}

/** Commands still in flight, so drain can settle them before the runtime disposes. */
export type AcceptedCommands = {
	active: Set<Promise<unknown>>;
};

export type PartitionProcessorScope = {
	ctx: PartitionProcessorContext;
	accepted: AcceptedCommands;
};
