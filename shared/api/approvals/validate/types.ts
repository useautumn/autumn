export type ApprovalRuleIssue = { path: string; message: string };

export type WhenEntry = {
	path: (string | number)[];
	key: string;
	value: unknown;
};
