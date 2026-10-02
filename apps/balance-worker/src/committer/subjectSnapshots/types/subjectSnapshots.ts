import type { SubjectSnapshotCustomer } from "@autumn/postgres";

/** The writer's side of `subject_snapshots`: whether rows are written right now, and the DELETE an evict owes. */
export type SubjectSnapshots = {
	/** Read at each decision, never kept: a flip in S3 changes the next read, record and evict. */
	written(): boolean;
	/** Removes a customer's snapshot rows on its partition's lane; resolves once the DELETE has committed. */
	dropCustomer(params: {
		topic: string;
		partition: number;
		customer: SubjectSnapshotCustomer;
	}): Promise<void>;
};
