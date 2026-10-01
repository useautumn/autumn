import type { CommitterDb } from "../../types/committerDb.js";
import type { ProgressMirror } from "../repos/progressMirror.js";
import type { Committer, PartitionPosition } from "./committer.js";

export type CommitterStateStoreContext = {
	committer: Committer;
	db: Pick<
		CommitterDb,
		| "readPartitionProgress"
		| "insertPartitionProgress"
		| "claimPartitionProgress"
	>;
	progress: ProgressMirror;
	claimTokenOf(position: PartitionPosition): string | undefined;
};
