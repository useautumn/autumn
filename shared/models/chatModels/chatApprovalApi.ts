export type ChatApprovalStatus =
	| "pending"
	| "running"
	| "approved"
	| "failed"
	| "cancelled";

export type ApprovalDetailStep = {
	/** The step's stored request args (withheld markers stripped). */
	params: Record<string, unknown>;
};

/** Wire contract for the dashboard's approval deep-link seed: just enough to
 * target the sheet and resolve the stored request. */
export type ApprovalDetail = {
	id: string;
	plan_id: string | null;
	steps: ApprovalDetailStep[];
	tool_name: string;
};

export type ApprovalDetailError = {
	code: "not_found" | "org_mismatch";
};
