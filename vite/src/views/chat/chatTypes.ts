import type {
	BillingPreviewResponse,
	CatalogPlanPreview,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";
import type { UIMessage } from "ai";

export type ApprovalStatus = "pending" | "approved" | "rejected";

/** Either a catalog change (plans/features), a billing action (line items),
 * or an unrecognized approval-gated tool's preview (rendered as params/JSON
 * only, no dedicated card). */
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

/** A write approval, carried inline in the thread as a `data-approval` part so
 * the card stays put (and shows its outcome) after the user decides. */
export interface LeafApprovalData {
	approvalId: string;
	/** The write tool's resolved args (attach params, etc.) for the params sheet. */
	params?: Record<string, unknown> | null;
	preview: ApprovalPreview | null;
	status: ApprovalStatus;
	toolName?: string;
}

/** A tool the agent ran, shown as a compact step in the thread. */
export interface LeafStepData {
	finishedAt?: number;
	label: string;
	startedAt?: number;
	status: "running" | "done" | "error";
}

/** Process narration shown inside the Worked dropdown. */
export interface LeafReasoningData {
	text: string;
}

/** A previewed plan update that needs a versioning/variant/migration decision
 * before the agent can call the gated write — sourced straight from the
 * `previewUpdateCatalog` result. */
export interface LeafCatalogDecisionData {
	plan: CatalogPlanPreview;
	status: "pending" | "submitted";
}

/** An agent question's answer options, rendered as one-click chips. The
 * prompt itself arrives as a normal text part just before this. */
export interface LeafQuestionData {
	options: { id?: string; label?: string }[];
	/** Eve's pending-input request id — answers go back as a structured
	 * inputResponse (message text never matches, it gets wrapped server-side). */
	requestId?: string;
	status: "pending" | "answered";
}

/** A clicked answer chip, sent back as message metadata. */
export interface LeafQuestionResponse {
	optionId: string;
	requestId: string;
}

/** The decision handed back to the agent as `clientContext` when the user
 * submits a `CatalogDecisionCard` — not persisted, just this turn's context. */
export interface LeafCatalogDecision {
	migrationDraft: boolean;
	planId: string;
	propagateVariantIds: string[];
	versioning: "create_version" | "update_current" | "update_all_versions";
}

/** Per-message metadata sent with `sendMessage`. Optional — plain chat
 * messages carry none. */
export type LeafMessageMetadata = {
	catalogDecision?: LeafCatalogDecision;
	questionResponse?: LeafQuestionResponse;
};

/** Shape returned by /agent/interactions for a pending approval. */
export interface LeafApproval {
	id: string;
	preview: ApprovalPreview | null;
	tool_args?: Record<string, unknown> | null;
	tool_name?: string;
}

/** Tool args may be wrapped in a `{ request }` envelope — unwrap for display. */
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
		// Key drives the wire type (`data-${key}`) — hyphenated so it reads as
		// `data-catalog-decision`, matching the rest of the data-part naming.
		"catalog-decision": LeafCatalogDecisionData;
		question: LeafQuestionData;
		reasoning: LeafReasoningData;
		step: LeafStepData;
	}
>;

/** Which approval is mid-decision (showing a spinner), or null. */
export type DecidingState = {
	action: "approve" | "reject";
	approvalId: string;
} | null;
