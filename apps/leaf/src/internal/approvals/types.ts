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
	| { result: unknown; text: string; toolName?: string };

export type ApprovalActionDeps = {
	resolveApproval: (input: {
		approval: ChatApproval;
		onProgress?: (statusLine: string) => void;
		providerUserId: string;
		token?: string;
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
		approval: ChatApproval;
		providerUserId: string;
	}) => Promise<{ allowed: true; token?: string } | { allowed: false; text: string }>;
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
