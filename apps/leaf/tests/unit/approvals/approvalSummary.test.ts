import { describe, expect, test } from "bun:test";
import {
	approvalSummaryFromWrites,
	withoutApprovalSummary,
} from "../../../src/internal/approvals/utils/approvalSummary.js";

describe("approval summary transport", () => {
	test("uses one agent-authored summary for the approval group", () => {
		expect(
			approvalSummaryFromWrites({
				writes: [
					{
						input: {
							approval_summary:
								"I used the requested amount as the monthly base price.",
						},
						requestId: "one",
						toolName: "attach",
					},
					{
						input: { approval_summary: "A different later summary." },
						requestId: "two",
						toolName: "updateCustomer",
					},
				],
			}),
		).toBe("I used the requested amount as the monthly base price.");
	});

	test("strips presentation metadata before calling MCP", () => {
		expect(
			withoutApprovalSummary({
				approval_summary: "Shown after the card.",
				intent: "Attach Pro",
				request: { customer_id: "cus_1" },
			}),
		).toEqual({
			intent: "Attach Pro",
			request: { customer_id: "cus_1" },
		});
	});
});
