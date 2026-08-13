import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import type { ApprovalCardStatus } from "../../ui/blocks.js";

export type { ApprovalCardStatus };

export type ActionMessageContent = Parameters<
	NonNullable<ActionEvent["adapter"]["editMessage"]>
>[2];

type ApprovalRunError = {
	// `retryable` means the write never ran to completion (a session crash /
	// interruption), so the approval stays pending and the user can re-apply.
	error: true;
	message: string;
	retryable?: boolean;
};

/** The outcome of resolving one approval group — the writes a user decided
 * together on a single card. */
export type ApprovalGroupRunResult =
	| ApprovalRunError
	| {
			/** The resumed turn parked on more gated writes — surfaces that mimic
			 * chat (Slack) post the new group's card; the dashboard picks it up by
			 * poll. */
			chainedGroupId?: string;
			/** The resumed turn parked on an ask_question — rich surfaces render
			 * the options as buttons. */
			question?: {
				options: { id?: string; label?: string }[];
				prompt: string;
				requestId: string;
				sessionId: string;
			};
			/** Per-approval tool output, keyed by approval id. Only harnesses that
			 * run each write themselves populate this; the ones that resume the whole
			 * turn report through `text` instead. */
			results?: Record<string, unknown>;
			text: string;
	  };

export type ApprovalAuthorization =
	| { allowed: true; approverToken?: string }
	| { allowed: false; text: string };

export type ApprovalActionDeps = {
	resolveApprovalGroup: (input: {
		approvals: ChatApproval[];
		onProgress?: (statusLine: string) => void;
		providerUserId: string;
		approverToken?: string;
	}) => Promise<ApprovalGroupRunResult>;
	cancelApprovalGroup: (input: {
		approvals: ChatApproval[];
		providerUserId: string;
	}) => Promise<ChatApproval[]>;
	claimApprovalGroup: (input: {
		approvals: ChatApproval[];
		providerUserId: string;
	}) => Promise<ChatApproval[]>;
	releaseApprovalGroup?: (input: {
		approvals: ChatApproval[];
		providerUserId: string;
	}) => Promise<ChatApproval[]>;
	authorizeApprovalClicker?: (input: {
		approval: ChatApproval;
		providerUserId: string;
	}) => Promise<ApprovalAuthorization>;
	editActionMessage: (input: {
		content: ActionMessageContent;
		event: ActionEvent;
	}) => Promise<void>;
	/** The clicked row plus every sibling decided with it, oldest first. */
	getApprovalGroup: (input: { approvalId: string }) => Promise<ChatApproval[]>;
	logger: Pick<AutumnLogger, "error" | "info" | "warn">;
	postThreadReply: (input: {
		event: ActionEvent;
		markdown: string;
	}) => Promise<void>;
};
