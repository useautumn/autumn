export type ChatApprovalStatus =
	| "pending"
	| "running"
	| "approved"
	| "failed"
	| "cancelled";

export type ApprovalDetailWrite = {
	params: Record<string, unknown>;
};

export type ApprovalDetail = {
	id: string;
	status: ChatApprovalStatus | "expired";
	plan_id: string | null;
	writes: ApprovalDetailWrite[];
	tool_name: string;
};

export type ApprovalDetailError = {
	code: "not_found" | "org_mismatch";
};
