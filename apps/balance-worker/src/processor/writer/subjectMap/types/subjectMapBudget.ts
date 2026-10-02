export type SubjectMapBudgetMember = {
	maxBytes(): number;
	leave(): void;
};

/**
 * One worker's resident-state allowance across the partitions it holds. A
 * partition may use whatever the others leave, and is always owed an equal
 * share, so one large customer fits while the rest sit nearly empty and the
 * worker-wide total still holds.
 */
export type SubjectMapBudget = {
	totalBytes: number;
	members(): number;
	/** `sizeBytes` reports what this partition holds now, so the others know what it leaves them. */
	join(params: { sizeBytes: () => number }): SubjectMapBudgetMember;
};
