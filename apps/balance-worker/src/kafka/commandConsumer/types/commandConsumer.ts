import type { AutumnLogger } from "@autumn/logging";
import type { PartitionRuntimePort } from "../../../partitions/types/partitions.js";

/** What consuming a queued command needs: the partition's admitted runtime, and somewhere to say what became of it. */
export type CommandConsumerContext = {
	findOwnedRuntime(position: {
		partition: number;
	}): PartitionRuntimePort | undefined;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};
