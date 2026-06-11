import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";

export type ActionMessageContent = Parameters<
	NonNullable<ActionEvent["adapter"]["editMessage"]>
>[2];

export type ApprovalCardStatus =
	| "approved"
	| "cancelled"
	| "failed"
	| "running";

export type ApprovalActionDeps = {
	approveAndRun: (input: {
		approvalId: string;
		providerUserId: string;
	}) => Promise<unknown>;
	cancelApproval: (input: {
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
};
