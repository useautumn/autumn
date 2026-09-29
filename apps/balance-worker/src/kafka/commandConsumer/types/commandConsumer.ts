import type { IdempotencyKeyStore } from "@autumn/dynamodb";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionRuntimePort } from "../../../partitions/types/partitions.js";

/** What consuming a queued command needs: the partition's admitted runtime, and somewhere to say what became of it. */
export type CommandConsumerContext = {
	findOwnedRuntime(position: {
		partition: number;
	}): PartitionRuntimePort | undefined;
	/** How far the partition's commands are decided, from Postgres; null before the bookmark exists. */
	readCommandNextOffset(position: { partition: number }): bigint | null;
	idempotencyKeys: IdempotencyKeyStore;
	logger?: Pick<AutumnLogger, "info" | "warn">;
	/** Parks the partition behind a command whose batch the broker refused: withdrawn from the
	 *  consumer at once, restarted from the store and log later. Absent, the failure is thrown. */
	markUnavailable?(failure: { partition: number; cause: unknown }): void;
};
