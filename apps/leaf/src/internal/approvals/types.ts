import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import type { ApprovalCardStatus } from "../../ui/blocks.js";

export type { ApprovalCardStatus };

export type ActionMessageContent = Parameters<
	NonNullable<ActionEvent["adapter"]["editMessage"]>
>[2];

export type ApprovalRunResult =
	| { error: true; message: string }
	| { result: unknown; text: string; toolName?: string };

export type ApprovalActionDeps = {
	approveAndRun: (input: {
		approval: ChatApproval;
		onProgress?: (statusLine: string) => void;
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
