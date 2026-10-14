export type SubjectMapBudgetMember = {
	maxBytes(): number;
	leave(): void;
};

export type SubjectMapBudget = {
	totalBytes: number;
	members(): number;
	join(params: { sizeBytes: () => number }): SubjectMapBudgetMember;
};
