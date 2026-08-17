import type { UIMessage } from "ai";

export type LeafApprovalStatus = "pending" | "approved" | "rejected";

export type LeafUiMessage = UIMessage<
	never,
	{
		approval: {
			approvalId: string;
			params?: unknown;
			preview: unknown;
			status: LeafApprovalStatus;
			toolName?: string;
		};
		"catalog-decision": { plan: unknown; status: "pending" | "submitted" };
		question: {
			options: { id?: string; label?: string }[];
			requestId?: string;
			status: "pending" | "answered";
		};
		reasoning: { text: string };
		step: {
			finishedAt?: number;
			label: string;
			startedAt?: number;
			status: "running" | "done" | "error";
		};
	}
>;

export type TimestampedMessage = { msg: LeafUiMessage; ts: number };
