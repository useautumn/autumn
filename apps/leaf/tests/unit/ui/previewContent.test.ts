import { describe, expect, test } from "bun:test";
import { approvalCard } from "../../../src/ui/blocks.js";
import {
	parsePreviewPayload,
	previewElements,
} from "../../../src/ui/previewContent.js";

const attachPreview = {
	object: "attach_preview",
	customer_id: "cus_1",
	currency: "usd",
	line_items: [
		{
			display_name: "Pro Checkout",
			description: "Pro Checkout - Base Price",
			subtotal: 20,
			total: 20,
			discounts: [],
		},
		{
			display_name: "Messages",
			description: "Prepaid usage",
			subtotal: 5.5,
			total: 5.5,
			discounts: [],
		},
	],
	subtotal: 25.5,
	total: 25.5,
	next_cycle: { starts_at: 1812731225000, subtotal: 40, total: 40 },
	redirect_to_checkout: false,
};

describe("parsePreviewPayload", () => {
	test("unwraps MCP content arrays of JSON text", () => {
		const payload = parsePreviewPayload([
			{ type: "text", text: JSON.stringify(attachPreview) },
		]);
		expect(payload?.customer_id).toBe("cus_1");
	});

	test("unwraps the agent {preview, pending} wrapper", () => {
		const payload = parsePreviewPayload({
			preview: attachPreview,
			pending: true,
			message: "Preview ready",
		});
		expect(payload?.object).toBe("attach_preview");
	});

	test("returns null for model prose", () => {
		expect(parsePreviewPayload("I'll preview this now!")).toBeNull();
	});
});

describe("previewElements", () => {
	test("renders billing previews as a line item table with totals", () => {
		const elements = previewElements(attachPreview);
		const json = JSON.stringify(elements);

		expect(elements?.[0]?.type).toBe("table");
		expect(json).toContain("Pro Checkout");
		expect(json).toContain("$20.00");
		expect(json).toContain("$5.50");
		expect(json).toContain("Due now");
		expect(json).toContain("Next cycle");
		expect(json).toContain("$40.00");
	});

	test("labels update subscription intents", () => {
		const json = JSON.stringify(
			previewElements({
				...attachPreview,
				object: "update_subscription_preview",
				intent: "cancel_end_of_cycle",
			}),
		);
		expect(json).toContain("Cancel at end of cycle");
	});

	test("renders createBalance local previews as fields", () => {
		const json = JSON.stringify(
			previewElements({
				action: "createBalance",
				request: {
					customer_id: "cus_1",
					feature_id: "credits",
					included_grant: 500,
					expires_at: 1812731225000,
				},
				impact: "Creates a standalone balance grant.",
			}),
		);
		expect(json).toContain("credits");
		expect(json).toContain("500");
		expect(json).toContain("Expires");
		expect(json).toContain("standalone balance grant");
	});
});

describe("approvalCard with structured previews", () => {
	test("summarizes structured billing previews in the approval card", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			preview: attachPreview,
		});
		const json = JSON.stringify(card);

		expect(json).toContain("Due today");
		expect(json).toContain("$25.50");
		expect(json).toContain("then $40.00");
		expect(card.children.at(-1)?.type).toBe("actions");
	});

	test("moves environment to subtitle and config to a muted line", () => {
		const card = approvalCard({
			id: "approval_1",
			env: "sandbox" as never,
			toolName: "attach",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					plan_id: "pro",
					redirect_mode: "if_required",
					invoice_mode: { enabled: true, finalize: false },
				},
			},
			preview: attachPreview,
		});

		expect(card.subtitle).toContain("Sandbox");
		const muted = card.children.filter(
			(child) => child.type === "text" && child.style === "muted",
		);
		const mutedJson = JSON.stringify(muted);
		expect(mutedJson).toContain("redirect: if_required");
		expect(mutedJson).toContain("billed by invoice");
		expect(mutedJson).toContain("draft invoice");
		expect(JSON.stringify(card.children)).not.toContain("Environment");
	});

	test("shows schedule start dates from tool args", () => {
		const card = approvalCard({
			id: "approval_2",
			toolName: "createSchedule",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					plan_id: "pro",
					starts_at: 1812731225000,
				},
			},
			preview: attachPreview,
		});
		expect(JSON.stringify(card)).toContain("Starts");
	});
});
