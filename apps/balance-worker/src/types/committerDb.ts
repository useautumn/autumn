import type {
	FlushRequest,
	FlushResult,
	PartitionProgressRow,
} from "@autumn/postgres";

type PartitionPosition = { topic: string; partition: number };

export type CommitterDb = {
	readPartitionProgress(
		params: PartitionPosition,
	): Promise<PartitionProgressRow | null>;
	insertPartitionProgress(
		params: PartitionPosition & { nextOffset: bigint; claimToken?: string },
	): Promise<void>;
	claimPartitionProgress(
		params: PartitionPosition & { claimToken: string },
	): Promise<void>;
	flush(request: FlushRequest): Promise<FlushResult>;
};
