import { expect, test } from "bun:test";
import { classifyWriteExecution } from "../../../src/internal/approvals/utils/writeExecutionResult.js";

const denied = {
	code: "permission_denied",
	message: "Charges need an owner.",
	details: {
		violations: [
			{ field: "paid", label: "Charges customer", limit: false, actual: true },
		],
		decided_by: {
			level: "everyone",
			rule_id: "rule_1",
			rule_name: "No charges",
		},
		allowed_roles: ["owner"],
	},
};

const deniedText = [
	"You can't approve this. Charges need an owner.",
	"• Charges customer: limit No, this request Yes",
	"Who can approve it: Owner.",
].join("\n");

test("a write the rules denied fails with the denial, read from the MCP result", () => {
	expect(
		classifyWriteExecution({
			result: {
				isError: true,
				content: [{ type: "text", text: JSON.stringify(denied) }],
			},
		}),
	).toEqual({ detail: deniedText, status: "failed" });
});

test("a denial inside an API request error reads the same", () => {
	expect(
		classifyWriteExecution({
			result: {
				isError: true,
				content: [
					{
						type: "text",
						text: `Autumn API request failed (403): ${JSON.stringify(denied)}`,
					},
				],
			},
		}),
	).toEqual({ detail: deniedText, status: "failed" });
});

test("any other failure keeps its own message", () => {
	const outcome = classifyWriteExecution({
		result: {
			isError: true,
			content: [{ type: "text", text: "Customer not found" }],
		},
	});
	expect(outcome).toEqual({ detail: "Customer not found", status: "failed" });
});
