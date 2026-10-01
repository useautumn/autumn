export type SubjectMapBudgetMember = {
	maxBytes(): number;
	leave(): void;
};

/** One worker's resident-state allowance, split evenly across the partitions it holds at the moment. */
export type SubjectMapBudget = {
	totalBytes: number;
	members(): number;
	join(): SubjectMapBudgetMember;
};
