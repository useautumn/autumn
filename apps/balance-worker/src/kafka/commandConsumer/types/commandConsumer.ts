import type { IdempotencyKeyStore } from "@autumn/dynamodb";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionRuntimePort } from "../../../partitions/types/partitions.js";

export type CommandConsumerContext = {
	findOwnedRuntime(position: {
		partition: number;
	}): PartitionRuntimePort | undefined;
	readCommandNextOffset(position: { partition: number }): bigint | null;
	idempotencyKeys: IdempotencyKeyStore;
	logger?: Pick<AutumnLogger, "info" | "warn">;
	markUnavailable?(failure: { partition: number; cause: unknown }): void;
};
