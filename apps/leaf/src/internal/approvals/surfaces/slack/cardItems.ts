import type { ChatApproval } from "@autumn/shared";
import type { ApprovalCardItem } from "../../../../ui/blocks.js";

/** Eve's option ids ride in the stored args; they are wiring, not something an
 * approver should read. */
export const publicToolArgs = (args: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(args).filter(([key]) => !key.startsWith("_eve")),
	);

const toolArgsOf = (approval: ChatApproval) =>
	approval.tool_args && typeof approval.tool_args === "object"
		? publicToolArgs(approval.tool_args as Record<string, unknown>)
		: {};

export const approvalCardItems = (
	approvals: ChatApproval[],
): ApprovalCardItem[] =>
	approvals.map((approval) => ({
		preview: approval.preview ?? undefined,
		toolArgs: toolArgsOf(approval),
		toolName: approval.tool_name,
	}));
