export type ChatApprovalStatus =
	| "pending"
	| "running"
	| "approved"
	| "failed"
	| "cancelled";

/** A gated write's stored request args, with withheld markers stripped. */
export type ApprovalDetailWrite = {
	params: Record<string, unknown>;
};

/** Deliberately minimal: just enough to target a sheet and resolve the
 * stored request. */
export type ApprovalDetail = {
	id: string;
	/** Effective status — pending past its expiry reads as expired. */
	status: ChatApprovalStatus | "expired";
	plan_id: string | null;
	writes: ApprovalDetailWrite[];
	tool_name: string;
};

export type ApprovalDetailError = {
	code: "not_found" | "org_mismatch";
};
