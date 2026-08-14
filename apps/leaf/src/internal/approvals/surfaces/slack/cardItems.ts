import type { ChatApproval } from "@autumn/shared";
import type { ApprovalCardItem } from "../../../../ui/blocks.js";
import { publicToolArgs } from "../../utils/toolRequest.js";

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
