import type { AutumnLogger } from "@autumn/logging";
import type { PartitionRuntimePort } from "../../../partitions/types/partitions.js";

/** What consuming a queued command needs: the partition's admitted runtime, and somewhere to say what became of it. */
export type CommandConsumerContext = {
	findOwnedRuntime(position: {
		partition: number;
	}): PartitionRuntimePort | undefined;
	/** How far the partition's commands are decided, from Postgres; null before the bookmark exists. */
	readCommandNextOffset(position: { partition: number }): bigint | null;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};
