import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import type { ApprovalCardStatus } from "../../ui/blocks.js";

export type { ApprovalCardStatus };

export type ActionMessageContent = Parameters<
	NonNullable<ActionEvent["adapter"]["editMessage"]>
>[2];

export type ApprovalRunResult =
	// `retryable` means the write never ran to completion (a session crash /
	// interruption), so the approval stays pending and the user can re-apply.
	| { error: true; message: string; retryable?: boolean }
	| {
			/** The resumed turn parked on another gated write — surfaces that mimic
			 * chat (Slack) post this row's card; the dashboard picks it up by poll. */
			chainedApprovalId?: string;
			/** The resumed turn parked on an ask_question — rich surfaces render
			 * the options as buttons. */
			question?: {
				options: { id?: string; label?: string }[];
				prompt: string;
				requestId: string;
				sessionId: string;
			};
			result: unknown;
			text: string;
			toolName?: string;
	  };

export type ApprovalAuthorization =
	| { allowed: true; approverToken?: string }
	| { allowed: false; text: string };

export type ApprovalActionDeps = {
	resolveApproval: (input: {
		approval: ChatApproval;
		onProgress?: (statusLine: string) => void;
		providerUserId: string;
		approverToken?: string;
	}) => Promise<ApprovalRunResult>;
	denyApproval?: (input: {
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
	authorizeApprovalClicker?: (input: {
		action: "approve" | "dismiss";
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
	postEphemeralReply?: (input: {
		event: ActionEvent;
		markdown: string;
	}) => Promise<void>;
	postThreadReply: (input: {
		event: ActionEvent;
		markdown: string;
	}) => Promise<void>;
};
