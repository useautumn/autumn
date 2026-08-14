import type { ChatApproval } from "@autumn/shared";

export const approveOptionFromApproval = (approval: ChatApproval) => {
	const args = approval.tool_args as Record<string, unknown>;
	return typeof args._eveApproveOptionId === "string"
		? args._eveApproveOptionId
		: "approve";
};

export const denyOptionFromApproval = (approval: ChatApproval) => {
	const args = approval.tool_args as Record<string, unknown>;
	return typeof args._eveDenyOptionId === "string"
		? args._eveDenyOptionId
		: "deny";
};
