import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";

/** One partition's bookmark move, guarded by the offset the caller last saw. */
export type FlushBookmark = {
	topic: string;
	partition: number;
	expectedOffset: bigint;
	nextOffset: bigint;
	/** Left where it is when absent. */
	commandNextOffset?: bigint;
};

/** Everything one transaction lands: row changes (any row may repeat) and the bookmarks they advance. */
export type FlushRequest = {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
};

/** `applied[i]` answers for `changes[i]`, folded or not; bookmarks are all-or-nothing. */
export type FlushResult = { applied: boolean[] };
