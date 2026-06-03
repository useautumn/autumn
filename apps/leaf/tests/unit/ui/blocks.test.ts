import { AppEnv } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { approvalCard, approvalStatusCard } from "../../../src/ui/blocks.js";

describe("approval card", () => {
	test("renders billing approvals as structured cards", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: {
					customer_id: "get-full-entity-ordering",
					plan_id: "pro_att-disc-dedup",
				},
			},
			preview:
				"I'll preview this now!Here's the billing impact preview:Plan: ProCustomer: get-full-entity-orderingTotal $20.00No discounts applied",
		});

		expect(card.title).toBe("Attach plan?");
		expect(card.children[0]?.type).toBe("fields");
		expect(card.children.at(-1)?.type).toBe("actions");
		expect(JSON.stringify(card)).toContain("Sandbox");
		expect(JSON.stringify(card)).toContain("pro_att-disc-dedup");
		expect(JSON.stringify(card)).toContain("• Plan: Pro");
	});

	test("renders closed approvals without buttons or raw JSON", () => {
		const card = approvalStatusCard({
			status: "failed",
			toolName: "attach",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					plan_id: "pro",
				},
			},
			result: {
				error: true,
				message: "Tool input validation failed.",
				validationErrors: { fields: {} },
			},
		});

		expect(card.title).toBe("Attach plan failed");
		expect(card.children.at(-1)?.type).not.toBe("actions");
		expect(JSON.stringify(card)).toContain("Tool input validation failed.");
		expect(JSON.stringify(card)).not.toContain("validationErrors");
	});

	test("does not render raw request JSON as preview text", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "charlie",
					plan_id: "pro",
					customize: { price: { amount: 200, interval: "month" } },
				},
			},
			preview: {
				request: {
					customer_id: "charlie",
					plan_id: "pro",
				},
			},
		});

		expect(JSON.stringify(card)).toContain("$200/month");
		expect(JSON.stringify(card)).not.toContain('"request"');
		expect(card.children.at(-1)?.type).toBe("actions");
	});

	test("cleans markdown and keeps decimal amounts intact", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "charlie",
					plan_id: "pro",
					customize: { price: { amount: 400, interval: "month" } },
				},
			},
			preview:
				"Let me preview that update!\n**Immediate charge (proration)**\n- 💳 **$178.65 due now**\n- Credit for unused time: -$178.65",
		});

		const json = JSON.stringify(card);
		expect(json).toContain("$178.65 due now");
		expect(json).not.toContain("**");
		expect(json).not.toContain("$178.\\n");
		expect(json).not.toContain("Let me preview");
	});

	test("shows action progress and omits empty success text", () => {
		const running = approvalStatusCard({
			status: "running",
			toolName: "updateSubscription",
			toolArgs: { request: { customer_id: "charlie", plan_id: "pro" } },
		});
		const approved = approvalStatusCard({
			status: "approved",
			toolName: "updateSubscription",
			toolArgs: { request: { customer_id: "charlie", plan_id: "pro" } },
			preview: "**old preview**",
			result: {},
		});

		expect(JSON.stringify(running)).toContain(
			"Applying the approved action now",
		);
		expect(approved.title).toBe("Update subscription approved");
		expect(JSON.stringify(approved)).not.toContain("Applied successfully.");
		expect(JSON.stringify(approved)).not.toContain("old preview");
	});

	test("shows nested write result details", () => {
		const card = approvalStatusCard({
			status: "approved",
			env: AppEnv.Live,
			toolName: "attach",
			result: {
				result: {
					status: "created",
					checkout_url: "https://checkout.example",
				},
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Live");
		expect(json).toContain("Status: created");
		expect(json).toContain("Checkout URL: https://checkout.example");
	});
});
