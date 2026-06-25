import type {
	BillingPreviewResponse,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";
import type { UIMessage } from "ai";

export type ApprovalStatus = "pending" | "approved" | "rejected";

/** Either a catalog change (plans/features) or a billing action (line items). */
export type ApprovalPreview =
	| CatalogPreviewUpdateResponse
	| BillingPreviewResponse;

export const isBillingPreview = (
	preview: ApprovalPreview | null,
): preview is BillingPreviewResponse =>
	preview != null && "line_items" in preview;

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
	label: string;
	status: "running" | "done" | "error";
}

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
	never,
	{ approval: LeafApprovalData; step: LeafStepData }
>;

/** Which approval is mid-decision (showing a spinner), or null. */
export type DecidingState = {
	action: "approve" | "reject";
	approvalId: string;
} | null;
