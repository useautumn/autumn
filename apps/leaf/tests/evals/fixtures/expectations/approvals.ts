import type { ApprovalCountExpectation } from "./types.js";

export const approvals = {
	count: ({ count }: { count: number }): ApprovalCountExpectation => ({
		count,
		type: "approval.count",
	}),
};
