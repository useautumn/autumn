import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import type { ApprovalCardStatus } from "../../ui/blocks.js";

export type { ApprovalCardStatus };

export type ActionMessageContent = Parameters<
	NonNullable<ActionEvent["adapter"]["editMessage"]>
>[2];

/** Outcome of one write on a grouped card, in apply order. */
export type ApprovalWriteOutcome = {
	status: "applied" | "failed" | "pending" | "skipped" | "unknown";
	toolName: string;
};

export type ApprovalRunResult =
	// The money facts changed since the card was shown; nothing executed and
	// the refreshed card must be re-approved.
	| {
			drifted: true;
			message: string;
	  }
	// `retryable` means the write never ran to completion (a session crash /
	// interruption), so the approval stays pending and the user can re-apply.
	| {
			error: true;
			message: string;
			retryable?: boolean;
			writes?: ReadonlyArray<ApprovalWriteOutcome>;
	  }
	| {
			result: unknown;
			writes?: ReadonlyArray<ApprovalWriteOutcome>;
			text: string;
			toolName?: string;
	  };

export type ApprovalAuthorization =
	| { allowed: true }
	| { allowed: false; text: string };

export type ApprovalActionDeps = {
	resolveApproval: (input: {
		approval: ChatApproval;
		providerUserId: string;
	}) => Promise<ApprovalRunResult>;
	cancelApproval: (input: {
		approvalId: string;
		providerUserId: string;
	}) => Promise<ChatApproval | undefined>;
	claimApproval: (input: {
		approvalId: string;
		providerUserId: string;
	}) => Promise<ChatApproval | undefined>;
	releaseApproval?: (input: {
		approvalId: string;
		providerUserId: string;
	}) => Promise<ChatApproval | undefined>;
	authorizeApprovalClicker?: (input: {
		approval: ChatApproval;
		providerUserId: string;
	}) => Promise<ApprovalAuthorization>;
	editActionMessage: (input: {
		content: ActionMessageContent;
		event: ActionEvent;
	}) => Promise<void>;
	getApproval: (input: {
		approvalId: string;
	}) => Promise<ChatApproval | undefined>;
	logger: Pick<AutumnLogger, "error" | "info" | "warn">;
	postThreadReply: (input: {
		event: ActionEvent;
		markdown: string;
	}) => Promise<void>;
};
