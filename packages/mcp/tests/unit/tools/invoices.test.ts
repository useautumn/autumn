import { afterEach, expect, mock, test } from "bun:test";
import { InvoiceStatus } from "@autumn/shared";
import { createRawAutumnOperationTools } from "../../../src/tools/index.js";
import {
	invoices,
	summarizeStripeInvoice,
} from "../../../src/tools/invoices.js";

test("listInvoices accepts a stripe_id filter", () => {
	const parsed = invoices.schemas.listInvoices.parse({
		customer_id: "customer_123",
		stripe_id: "in_123",
		status: [InvoiceStatus.Open],
	});

	expect(parsed.stripe_id).toBe("in_123");
	expect(parsed.status).toEqual([InvoiceStatus.Open]);
});

const auth = {
	apiKey: "am_sk_test",
	env: "sandbox" as const,
	principalId: "test",
	resource: "test",
	scopes: [],
	serverURL: "https://api.example.com",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const INVOICE_TOOL_NAMES = [
	"listInvoices",
	"listInvoiceTemplates",
	"getInvoice",
	"getStripeInvoice",
	"previewCreateInvoice",
	"createInvoice",
	"previewReissueInvoice",
	"reissueInvoice",
	"finalizeInvoice",
	"payInvoice",
	"voidInvoice",
];

test("invoice tools are registered in the MCP toolset", () => {
	const tools = createRawAutumnOperationTools({ requireIntent: false });

	for (const toolName of INVOICE_TOOL_NAMES) {
		expect(tools[toolName]).toBeDefined();
	}
});

test("invoice writes are destructive and reads are not", () => {
	const tools = createRawAutumnOperationTools({ requireIntent: false });
	const destructive = INVOICE_TOOL_NAMES.filter(
		(toolName) => tools[toolName]?.mcp?.annotations?.destructiveHint,
	);

	expect(destructive.sort()).toEqual([
		"createInvoice",
		"finalizeInvoice",
		"payInvoice",
		"reissueInvoice",
		"voidInvoice",
	]);
});

test("the preview and write tools own the preview flag", async () => {
	const fetch = mock(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			Response.json({ ok: true }),
	);
	globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
	const tools = createRawAutumnOperationTools({ requireIntent: false });
	const request = { invoice_id: "inv_123", net_terms_days: 30 };
	const context = { mcp: { extra: { authInfo: auth } } };

	expect(
		invoices.schemas.reissueInvoice.parse({ ...request, preview: true }),
	).not.toHaveProperty("preview");

	await tools.previewReissueInvoice?.execute?.({ request }, context as never);
	await tools.reissueInvoice?.execute?.({ request }, context as never);

	const sentBodies = fetch.mock.calls.map(([url, init]) => ({
		path: new URL(String(url)).pathname,
		body: JSON.parse(String(init?.body)),
	}));
	expect(sentBodies).toEqual([
		{ path: "/v1/invoices.reissue", body: { ...request, preview: true } },
		{ path: "/v1/invoices.reissue", body: { ...request, preview: false } },
	]);
});

test("summarizeStripeInvoice keeps payment state and drops everything else", () => {
	const summary = summarizeStripeInvoice({
		id: "in_123",
		object: "invoice",
		number: "TNUX5UAX-0003",
		status: "open",
		collection_method: "charge_automatically",
		billing_reason: "subscription_cycle",
		currency: "usd",
		total: 2000,
		amount_due: 2000,
		amount_paid: 0,
		amount_remaining: 2000,
		attempted: true,
		attempt_count: 2,
		next_payment_attempt: 1790000000,
		auto_advance: true,
		customer: {
			id: "cus_123",
			email: "billing@example.com",
			name: "Example",
			tax_ids: { data: [] },
		},
		status_transitions: {
			finalized_at: 1789000000,
			paid_at: null,
			voided_at: null,
			marked_uncollectible_at: null,
		},
		lines: { data: [{ id: "il_1" }] },
		payments: {
			data: [
				{
					status: "failed",
					payment: {
						type: "payment_intent",
						payment_intent: {
							id: "pi_123",
							status: "requires_payment_method",
							client_secret: "pi_123_secret",
							last_payment_error: {
								type: "card_error",
								code: "card_declined",
								decline_code: "insufficient_funds",
								message: "Your card has insufficient funds.",
								payment_method: { id: "pm_123" },
							},
						},
					},
				},
			],
		},
	});

	expect(summary).not.toHaveProperty("lines");
	expect(summary.customer).toEqual({
		id: "cus_123",
		email: "billing@example.com",
		name: "Example",
	});
	expect(summary.attempt_count).toBe(2);

	const paymentIntent = summary.payments?.data[0]?.payment?.payment_intent;
	expect(paymentIntent).toEqual({
		id: "pi_123",
		status: "requires_payment_method",
		last_payment_error: {
			type: "card_error",
			code: "card_declined",
			decline_code: "insufficient_funds",
			message: "Your card has insufficient funds.",
		},
	});
});

test("getInvoice looks the invoice up by its Autumn ID", async () => {
	const invoice = { id: "inv_123", status: "open", total: 50 };
	const fetch = mock(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			Response.json({ list: [invoice], next_cursor: null }),
	);
	globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
	const tools = createRawAutumnOperationTools({ requireIntent: false });
	const context = { mcp: { extra: { authInfo: auth } } };

	const result = await tools.getInvoice?.execute?.(
		{ request: { invoice_id: "inv_123" } },
		context as never,
	);

	expect(result).toEqual(invoice);
	const [url, init] = fetch.mock.calls[0] ?? [];
	expect(new URL(String(url)).pathname).toBe("/v1/invoices.list");
	expect(JSON.parse(String(init?.body))).toEqual({
		invoice_id: "inv_123",
		limit: 1,
	});
});
