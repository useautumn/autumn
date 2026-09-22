import type { IdempotencyKeyStore } from "@autumn/dynamodb";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";

/** What consuming one queued command needs: the partition's processor, the key store, and somewhere to say what became of it. */
export type ConsumeContext = {
	processor: PartitionProcessor;
	idempotencyKeys: IdempotencyKeyStore;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};
