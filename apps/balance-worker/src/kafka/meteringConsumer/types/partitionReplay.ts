import type {
	PartitionPosition,
	ProgressTracker,
	TopicConsumer,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type {
	PartitionOutcomeFollowerPort,
	RuntimeUnavailableListener,
} from "../../../runtime/types/partitionRuntime.js";
import type { SqliteBalanceStateStore } from "../../../state/sqliteBalanceStateStore.js";

export interface PartitionReplay extends PartitionOutcomeFollowerPort {
	markUnavailable(failure: { cause: unknown }): void;
}
export type PartitionReplayContext = {
	consumption: Pick<
		TopicConsumer,
		| "withdrawPartition"
		| "resumePartition"
		| "seekPartition"
		| "pausePartition"
		| "resumeFetching"
	>;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: Pick<SqliteBalanceStateStore, "readNextOffset">;
	positionTracker: ProgressTracker;
};
export type PartitionReplayState = {
	status: "created" | "starting" | "following" | "unavailable" | "stopped";
	position: PartitionPosition | null;
	onUnavailable: RuntimeUnavailableListener | null;
	abortController: AbortController | null;
	startPromise: Promise<void> | null;
	stopPromise: Promise<void> | null;
};
