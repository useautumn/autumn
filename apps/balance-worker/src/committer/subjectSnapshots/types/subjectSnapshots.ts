import type { SubjectSnapshotCustomer } from "@autumn/postgres";

/** The DELETE an evict owes `subject_snapshots`. */
export type SubjectSnapshots = {
	/** Removes a customer's snapshot rows on its partition's lane; resolves once the DELETE has committed. */
	dropCustomer(params: {
		topic: string;
		partition: number;
		customer: SubjectSnapshotCustomer;
	}): Promise<void>;
};
