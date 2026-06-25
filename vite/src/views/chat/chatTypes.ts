import type { CatalogPreviewUpdateResponse } from "@autumn/shared";
import type { UIMessage } from "ai";

export type ApprovalStatus = "pending" | "approved" | "rejected";

/** A plan-write approval, carried inline in the thread as a `data-approval`
 * part so the card stays put (and shows its outcome) after the user decides. */
export interface LeafApprovalData {
	approvalId: string;
	preview: CatalogPreviewUpdateResponse | null;
	status: ApprovalStatus;
}

/** A tool the agent ran, shown as a compact step in the thread. */
export interface LeafStepData {
	label: string;
	status: "running" | "done" | "error";
}

/** Shape returned by /agent/interactions for a pending approval. */
export interface LeafApproval {
	id: string;
	preview: CatalogPreviewUpdateResponse | null;
}

export type LeafUIMessage = UIMessage<
	never,
	{ approval: LeafApprovalData; step: LeafStepData }
>;

/** Which approval is mid-decision (showing a spinner), or null. */
export type DecidingState = {
	action: "approve" | "reject";
	approvalId: string;
} | null;
