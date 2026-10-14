import type { SubjectRowChange } from "../../subjects/types/subjectRowChange.js";
import type { SubjectSnapshotWrites } from "../../subjects/types/subjectSnapshot.js";

export type FlushBookmark = {
	topic: string;
	partition: number;
	expectedOffset: bigint;
	nextOffset: bigint;
	commandNextOffset?: bigint;
	ownerFence?: { epoch: bigint; offset: bigint };
	claimToken?: string;
};

export type FlushRequest = {
	changes: readonly SubjectRowChange[];
	bookmarks: readonly FlushBookmark[];
	snapshots?: SubjectSnapshotWrites;
};

export type DeletedSubjectSnapshot = {
	orgId: string;
	env: string;
	customerId: string;
	entityId: string | null;
};

export type FlushResult = {
	applied: boolean[];
	snapshots?: { upserted: number; deleted: DeletedSubjectSnapshot[] };
};
