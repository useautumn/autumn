export type ApprovalRuleIssue = { path: string; message: string };

export type FilterEntry = {
	path: (string | number)[];
	key: string;
	value: unknown;
};
