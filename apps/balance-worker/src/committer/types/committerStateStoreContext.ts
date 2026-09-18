import type { CommitterDb } from "../../types/committerDb.js";
import type { ProgressMirror } from "../repos/progressMirror.js";
import type { Committer } from "./committer.js";

export type CommitterStateStoreContext = {
	committer: Committer;
	db: Pick<CommitterDb, "readNextOffset" | "insertPartitionProgress">;
	progress: ProgressMirror;
};
