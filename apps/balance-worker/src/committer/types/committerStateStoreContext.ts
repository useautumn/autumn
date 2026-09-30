import type { CommitterDb } from "../../types/committerDb.js";
import type { ProgressMirror } from "../repos/progressMirror.js";
import type { Committer, PartitionPosition } from "./committer.js";

export type CommitterStateStoreContext = {
	committer: Committer;
	db: Pick<CommitterDb, "readPartitionProgress" | "insertPartitionProgress">;
	progress: ProgressMirror;
	/** The epoch the partition's writer holds now, once the runtime has bound it; undefined before a claim. */
	ownerEpochOf?(position: PartitionPosition): bigint | undefined;
};
