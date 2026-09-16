import type {
	PartitionPosition,
	PartitionProgress,
	ProgressTracker,
	TopicConsumer,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { PartitionLogRange } from "../../../runtime/bootstrap/types/partitionBootstrap.js";
import type { RuntimeUnavailableListener } from "../../../runtime/types/partitionRuntime.js";
import type { StateStore } from "../../../state/types/stateStore.js";

export type PartitionReplay = {
	readLogRange(params: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<PartitionLogRange>;
	startAndCatchUp(params: {
		topic: string;
		partition: number;
		targetNextOffset: bigint;
		onUnavailable: RuntimeUnavailableListener;
	}): Promise<void>;
	readProgress(position: PartitionPosition): PartitionProgress;
	stop(): Promise<void>;
	markUnavailable(failure: { cause: unknown }): void;
};

export type PartitionReplayContext = {
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: Pick<StateStore, "readNextOffset">;
	positionTracker: ProgressTracker;
	consumption: Pick<
		TopicConsumer,
		| "resumePartition"
		| "withdrawPartition"
		| "seekPartition"
		| "pausePartition"
		| "resumeFetching"
	>;
};

export type PartitionReplayState = {
	status: "created" | "starting" | "following" | "unavailable" | "stopped";
	position: PartitionPosition;
	onUnavailable: RuntimeUnavailableListener | null;
	abortController: AbortController | null;
	startPromise: Promise<void> | null;
	stopPromise: Promise<void> | null;
};
