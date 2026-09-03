export type DuplicateBillingControlIssue = {
	code: "custom";
	message: string;
	input: unknown;
	path: Array<string | number>;
};
