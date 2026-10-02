import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
import type { SubjectSnapshotWrites } from "../../subjects/types/subjectSnapshot.js";

/** One partition's bookmark move, guarded by the offset the caller last saw. */
export type FlushBookmark = {
	topic: string;
	partition: number;
	expectedOffset: bigint;
	nextOffset: bigint;
	/** Left where it is when absent. */
	commandNextOffset?: bigint;
	/** The latest ownership fence the partition's log carried; kept only when its epoch is higher than the stored one. */
	ownerFence?: { epoch: bigint; offset: bigint };
	claimToken?: string;
};

/** Everything one transaction lands: row changes (any row may repeat), the bookmarks they advance, and the subject snapshots they replace or remove. */
export type FlushRequest = {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
	snapshots?: SubjectSnapshotWrites;
};

/** `applied[i]` answers for `changes[i]`, folded or not; bookmarks are all-or-nothing. Snapshot counts come back only when snapshot writes were requested. */
export type FlushResult = {
	applied: boolean[];
	snapshots?: { upserted: number; deleted: number };
};
