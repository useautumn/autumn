import type {
	PartitionPosition,
	PartitionProgress,
	ProgressTracker,
	TopicConsumer,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";
import type { PartitionLogRange } from "../../../runtime/bootstrap/types/partitionBootstrap.js";
import type { RuntimeUnavailableListener } from "../../../runtime/types/partitionRuntime.js";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { ReplayWindow } from "./replayWindow.js";

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
		fromBookmark?: boolean;
	}): Promise<void>;
	readProgress(position: PartitionPosition): PartitionProgress;
	awaitNextOffset(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
		signal?: AbortSignal;
	}): Promise<void>;
	stop(): Promise<void>;
	markUnavailable(failure: { cause: unknown }): void;
};

export type PartitionReplayContext = {
	partitionOffsets: Pick<Admin, "fetchTopicOffsets"> &
		Partial<Pick<Admin, "fetchTopicOffsetsByTimestamp">>;
	stateStore: Pick<StateStore, "readNextOffset">;
	positionTracker: ProgressTracker;
	replayWindow: ReplayWindow;
	replayFloorByPartition: Map<number, bigint>;
	logger?: Pick<AutumnLogger, "warn">;
	logEndSettle?: { attempts: number; delayMs: number };
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
	lastLogRange: PartitionLogRange | null;
	abortController: AbortController | null;
	startPromise: Promise<void> | null;
	stopPromise: Promise<void> | null;
};
