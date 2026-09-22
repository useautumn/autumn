import type { AutumnLogger } from "@autumn/logging";
import type { PartitionRuntimePort } from "../../partitions/types/partitions.js";

/** What consuming one queued command needs: the partition's admitted runtime, and somewhere to say what became of it. */
export type ConsumeContext = {
	runtime: PartitionRuntimePort;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};
