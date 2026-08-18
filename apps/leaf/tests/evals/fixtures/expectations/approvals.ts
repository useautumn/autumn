import type { ApprovalCountExpectation } from "./types.js";

export const approvals = {
	/** The run must park for approval exactly `count` times — the guard that a
	 * multi-write request was gated per write rather than silently collapsed. */
	count: ({ count }: { count: number }): ApprovalCountExpectation => ({
		count,
		type: "approval.count",
	}),
};
