import { describe, expect, test } from "bun:test";
import {
	approvalDescriptionFromWrites,
	withoutApprovalDescription,
} from "../../../src/internal/approvals/utils/approvalDescription.js";

describe("approval summary transport", () => {
	test("uses one agent-authored summary for the approval group", () => {
		expect(
			approvalDescriptionFromWrites({
				writes: [
					{
						input: {
							approval_description:
								"I used the requested amount as the monthly base price.",
						},
						requestId: "one",
						toolName: "attach",
					},
					{
						input: { approval_description: "A different later summary." },
						requestId: "two",
						toolName: "updateCustomer",
					},
				],
			}),
		).toBe("I used the requested amount as the monthly base price.");
	});

	test("strips presentation metadata before calling MCP", () => {
		expect(
			withoutApprovalDescription({
				approval_description: "Shown after the card.",
				intent: "Attach Pro",
				request: { customer_id: "cus_1" },
			}),
		).toEqual({
			intent: "Attach Pro",
			request: { customer_id: "cus_1" },
		});
	});
});
