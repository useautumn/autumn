import type {
	FlushRequest,
	FlushResult,
	PartitionProgressRow,
} from "@autumn/postgres";

type PartitionPosition = { topic: string; partition: number };

/** Postgres as the committer writes it. Tests stand this in. */
export type CommitterDb = {
	readPartitionProgress(
		params: PartitionPosition,
	): Promise<PartitionProgressRow | null>;
	insertPartitionProgress(
		params: PartitionPosition & { nextOffset: bigint },
	): Promise<void>;
	/** One transaction: every row update, then every bookmark; rolls back when a bookmark did not move. */
	flush(request: FlushRequest): Promise<FlushResult>;
};
