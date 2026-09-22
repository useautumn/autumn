import type { AutumnLogger } from "@autumn/logging";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";

/** What consuming one queued command needs: the partition's processor, and somewhere to say what became of it. */
export type ConsumeContext = {
	processor: PartitionProcessor;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};
