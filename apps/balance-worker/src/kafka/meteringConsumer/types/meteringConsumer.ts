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
	restart(): Promise<void>;
	createReplay(position: {
		partition: number;
		recentCommands: RecentCommands;
		producedOffsets?: ProducedOffsets;
		readOnly?: boolean;
		ownerEpoch?: () => string | undefined;
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
	commands?: { topic: string; handler: TopicRecordHandler };
	logger?: Pick<AutumnLogger, "warn">;
};
