import { describe, expect, test } from "bun:test";
import { parsePreviewPayload } from "@autumn/render";
import { approvalCard } from "../../../src/ui/blocks.js";
import { previewElements } from "../../../src/ui/previewContent.js";

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

	test("renders createBalance local previews as a table", () => {
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
		expect(json).toContain("table");
		expect(json).toContain("credits");
		expect(json).toContain("500");
		expect(json).toContain("Expires");
		expect(json).not.toContain("standalone balance grant");
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

		expect(json).toContain("Due now");
		expect(json).toContain("$25.50");
		expect(json).toContain("Next cycle");
		expect(json).toContain("$40.00");
		expect(card.children.at(-2)?.type).toBe("actions");
	});

	test("shows billing settings without the environment", () => {
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

		expect(card.subtitle).toBeUndefined();
		const muted = card.children.filter(
			(child) => child.type === "text" && child.style === "muted",
		);
		const mutedJson = JSON.stringify(muted);
		expect(mutedJson).toContain("Draft invoice");
		// Unset params no longer render badges — only explicit ones show.
		expect(mutedJson).not.toContain("Prorations");
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

describe("invoice approval cards", () => {
	const existingInvoice = {
		id: "inv_123",
		customer_id: "cus_1",
		entity_id: null,
		plan_ids: [],
		stripe_id: "in_123",
		processor_type: "stripe",
		status: "open",
		total: 50,
		amount_paid: 0,
		refunded_amount: 0,
		currency: "usd",
		created_at: 1790700465000,
		hosted_invoice_url: null,
		items: [
			{ id: "li_1", description: "Setup fee", amount: 30 },
			{ id: "li_2", description: "Onboarding", amount: 20 },
		],
	};

	const createInvoicePreview = {
		invoice: null,
		preview: {
			currency: "usd",
			lines: [
				{ description: "Setup fee", amount: 60, amount_after_discounts: 50 },
			],
			subtotal: 60,
			discount_total: 10,
			tax: {
				total: 5,
				amount_inclusive: 0,
				amount_exclusive: 5,
				status: "complete",
			},
			total: 55,
			amount_due: 55,
			issue_date: 1790700465000,
			due_date: 1793292465000,
		},
	};

	test("void, pay and finalize cards show the invoice's lines, total and status", () => {
		for (const toolName of ["voidInvoice", "payInvoice", "finalizeInvoice"]) {
			const json = JSON.stringify(
				approvalCard({
					id: "approval_1",
					toolName,
					toolArgs: { request: { invoice_id: "inv_123" } },
					preview: [{ type: "text", text: JSON.stringify(existingInvoice) }],
				}),
			);

			expect(json).toContain("inv_123");
			expect(json).toContain("Setup fee");
			expect(json).toContain("Onboarding");
			expect(json).toContain("$50.00");
			expect(json).toContain("Status: open");
			expect(json).toContain("Customer: cus_1");
		}
	});

	test("create and reissue cards show lines, discounts, tax, total and due date", () => {
		for (const toolName of ["createInvoice", "reissueInvoice"]) {
			const json = JSON.stringify(
				approvalCard({
					id: "approval_1",
					toolName,
					toolArgs: {
						request: { customer_id: "cus_1", invoice_id: "inv_123" },
					},
					preview: createInvoicePreview,
				}),
			);

			expect(json).toContain("Setup fee");
			// The line shows its pre-discount amount; the discount is its own row.
			expect(json).toContain('["Setup fee","$60.00"]');
			expect(json).not.toContain("$50.00");
			expect(json).toContain("Discounts");
			expect(json).toContain("-$10.00");
			expect(json).toContain("Tax");
			expect(json).toContain("$55.00");
			expect(json).toContain("Due Oct 29, 2026");
		}
	});
});
