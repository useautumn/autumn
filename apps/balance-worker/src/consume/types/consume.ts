import type { IdempotencyKeyStore } from "@autumn/dynamodb";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";

export type ConsumeContext = {
	processor: PartitionProcessor;
	idempotencyKeys: IdempotencyKeyStore;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};
