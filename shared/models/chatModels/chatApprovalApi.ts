import type { AppEnv } from "../genModels/genEnums.js";
import type { ChatApprovalStepStatus, ChatProvider } from "./chatTable.js";

export type ChatApprovalStatus =
	| "pending"
	| "running"
	| "approved"
	| "failed"
	| "cancelled";

/** Effective status adds the derived expired state (pending + past expiry). */
export type ChatApprovalEffectiveStatus = ChatApprovalStatus | "expired";

export type ApprovalDetailStepLink = { label: string; url: string };

export type ApprovalDetailStep = {
	error: string | null;
	id: string;
	links: ApprovalDetailStepLink[];
	params: Record<string, unknown>;
	position: number;
	preview: unknown;
	status: ChatApprovalStepStatus;
	tool_name: string;
};

export type ApprovalDetail = {
	/** Pending, unexpired, single-step attach/updateSubscription — the shapes
	 * the dashboard sheets can render and apply. */
	can_apply: boolean;
	created_at: number;
	customer_id: string | null;
	decided_at: number | null;
	decided_by_provider_user_id: string | null;
	env: AppEnv;
	expires_at: number;
	id: string;
	plan_id: string | null;
	provider: ChatProvider;
	status: ChatApprovalEffectiveStatus;
	steps: ApprovalDetailStep[];
	tool_name: string;
};

export type ApprovalDetailResponse = { approval: ApprovalDetail };

export type ApprovalDetailError = {
	code: "not_found" | "org_mismatch";
	/** Present only when the session user is a member of the owning org. */
	switch_to_org?: { id: string; name: string };
};
