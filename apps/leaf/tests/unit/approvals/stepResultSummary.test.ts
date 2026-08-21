import { describe, expect, test } from "bun:test";
import { summarizeStepResult } from "../../../src/internal/approvals/domain/stepResultSummary.js";

describe("summarizeStepResult", () => {
	test("whitelists outcome fields and never ships raw payloads", () => {
		const summary = summarizeStepResult({
			customer: { email: "secret@example.com", id: "cus_1" },
			invoice: {
				hosted_invoice_url: "https://invoice.stripe.com/i/abc",
				line_items: [{ amount: 2400, description: "Launch" }],
				status: "draft",
			},
			message: "Attached launch",
		});
		expect(summary).toEqual({
			links: [
				{ label: "View invoice", url: "https://invoice.stripe.com/i/abc" },
			],
			message: "Attached launch",
			requiredAction: null,
		});
		expect(JSON.stringify(summary)).not.toContain("secret@example.com");
	});

	test("unwraps MCP content envelopes", () => {
		const summary = summarizeStepResult({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						message: "Done",
						payment_url: "https://checkout.stripe.com/pay/x",
					}),
				},
			],
		});
		expect(summary?.message).toBe("Done");
		expect(summary?.links).toEqual([
			{ label: "Complete payment", url: "https://checkout.stripe.com/pay/x" },
		]);
	});

	test("surfaces required actions", () => {
		const summary = summarizeStepResult({
			required_action: { code: "payment_method", reason: "No card on file" },
		});
		expect(summary?.requiredAction).toEqual({
			code: "payment_method",
			reason: "No card on file",
		});
	});

	test("null results summarize to null", () => {
		expect(summarizeStepResult(null)).toBeNull();
	});
});
