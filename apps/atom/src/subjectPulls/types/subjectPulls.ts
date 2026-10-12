/** Stores a pulled body as a push would; false when a newer read was already held. */
export type ApplyPulled = (params: {
	customerId: string;
	body: string;
}) => Promise<boolean>;

/** One data folder's pulls: synchronous and never throws, so a check that missed only ever pays a counter and a lookup. */
export type FolderSubjectPulls = {
	/** Counts the miss, and pulls the subject unless it is held or the thread is at its in-flight cap. */
	request(params: { customerId: string; entityId: string | null }): void;
};

/** One per thread: every folder it opens shares its in-flight cap, since each subject has one owner thread. */
export type SubjectPulls = {
	forFolder(params: {
		tokenHash: () => string;
		applyPulled: ApplyPulled;
	}): FolderSubjectPulls;
	/** In-flight pulls settle without storing anything. */
	stop(): void;
};
