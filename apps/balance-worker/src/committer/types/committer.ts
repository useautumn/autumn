import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { CommitterDb } from "../../types/committerDb.js";

export type CommitterContext = { db: CommitterDb };

export type PartitionPosition = { topic: string; partition: number };

/** Lands committed log records in Postgres: one partition batch, one transaction. */
export type Committer = {
	apply(
		params: PartitionPosition & {
			expectedOffset: bigint;
			records: readonly DurableMutationRecord[];
		},
	): Promise<{ nextOffset: bigint }>;
};

/** The postgres backend's StateStore; the writer's map answers reads, this only commits and bookmarks. */
export type CommitterStateStore = StateStore & {
	/** Fills the progress mirror from Postgres; must run before bootstrap reads `readNextOffset`. */
	loadProgress(params: PartitionPosition): Promise<void>;
};
