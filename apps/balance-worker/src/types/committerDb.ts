import type { SubjectRowUpdate } from "@autumn/postgres";

type PartitionPosition = { topic: string; partition: number };

/** What one flush may do inside its transaction: move rows, then advance the bookmark. */
export type CommitterTransaction = {
	applySubjectRowUpdates(params: {
		updates: readonly SubjectRowUpdate[];
	}): Promise<{ applied: boolean[] }>;
	advancePartitionProgress(
		params: PartitionPosition & { expectedOffset: bigint; nextOffset: bigint },
	): Promise<{ advanced: boolean }>;
};

/** Postgres as the committer writes it. Tests stand this in. */
export type CommitterDb = {
	readNextOffset(params: PartitionPosition): Promise<bigint | null>;
	insertPartitionProgress(
		params: PartitionPosition & { nextOffset: bigint },
	): Promise<void>;
	transaction<Result>(
		run: (tx: CommitterTransaction) => Promise<Result>,
	): Promise<Result>;
};
