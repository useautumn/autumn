import type {
	KafkaConsumerClient,
	ProgressTracker,
	TopicRecordHandler,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";
import type { ProducedOffsets } from "../../../processor/writer/producedOffsets/createProducedOffsets.js";
import type { RecentCommands } from "../../../processor/writer/recentCommands/types/recentCommands.js";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { PartitionReplay } from "./partitionReplay.js";
import type { ReplayWindow } from "./replayWindow.js";

export type MeteringConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	/** The replay remembers every record it sees land into the partition's `recentCommands`. */
	createReplay(position: {
		partition: number;
		recentCommands: RecentCommands;
		/** Records the partition's own writer produced are passed unread. */
		producedOffsets?: ProducedOffsets;
	}): PartitionReplay;
	withdrawPartition(position: { partition: number }): Promise<void>;
	resumePartition(position: { partition: number }): void;
};

export type MeteringConsumerContext = {
	consumer: KafkaConsumerClient;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets"> &
		Partial<Pick<Admin, "fetchTopicOffsetsByTimestamp">>;
	stateStore: StateStore;
	positionTracker: ProgressTracker;
	replayWindow: ReplayWindow;
	/** Consumed on the same group membership, so partition n's commands reach partition n's owner. */
	commands?: { topic: string; handler: TopicRecordHandler };
	logger?: Pick<AutumnLogger, "warn">;
};
