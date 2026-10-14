import type {
	BillingPreviewResponse,
	CatalogPlanPreview,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";
import type { UIMessage } from "ai";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalPreview =
	| CatalogPreviewUpdateResponse
	| BillingPreviewResponse
	| Record<string, unknown>;

export const isBillingPreview = (
	preview: ApprovalPreview | null,
): preview is BillingPreviewResponse =>
	preview != null && "line_items" in preview;

export const isCatalogPreview = (
	preview: ApprovalPreview | null,
): preview is CatalogPreviewUpdateResponse =>
	preview != null &&
	("feature_changes" in preview || "plan_changes" in preview);

export interface LeafApprovalData {
	approvalId: string;
	params?: Record<string, unknown> | null;
	preview: ApprovalPreview | null;
	status: ApprovalStatus;
	toolName?: string;
}

export interface LeafStepData {
	finishedAt?: number;
	label: string;
	startedAt?: number;
	status: "running" | "done" | "error";
}

export interface LeafReasoningData {
	text: string;
}

export interface LeafCatalogDecisionData {
	plan: CatalogPlanPreview;
	status: "pending" | "submitted";
}

export interface LeafQuestionData {
	options: { id?: string; label?: string }[];
	requestId?: string;
	status: "pending" | "answered";
}

export interface LeafQuestionResponse {
	optionId: string;
	requestId: string;
}

export interface LeafCatalogDecision {
	migrationDraft: boolean;
	planId: string;
	propagateVariantIds: string[];
	versioning: "create_version" | "update_current" | "update_all_versions";
}

export type LeafMessageMetadata = {
	catalogDecision?: LeafCatalogDecision;
	questionResponse?: LeafQuestionResponse;
};

export interface LeafApproval {
	id: string;
	preview: ApprovalPreview | null;
	tool_args?: Record<string, unknown> | null;
	tool_name?: string;
}

export const unwrapRequestParams = (
	args?: Record<string, unknown> | null,
): Record<string, unknown> | null => {
	if (!args) return null;
	const request = args.request;
	return request && typeof request === "object"
		? (request as Record<string, unknown>)
		: args;
};

export type LeafUIMessage = UIMessage<
	LeafMessageMetadata,
	{
		approval: LeafApprovalData;
		"catalog-decision": LeafCatalogDecisionData;
		question: LeafQuestionData;
		reasoning: LeafReasoningData;
		step: LeafStepData;
	}
>;

export type DecidingState = {
	action: "approve" | "reject";
	approvalId: string;
} | null;
