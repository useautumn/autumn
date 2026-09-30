import { afterEach, expect, mock, test } from "bun:test";
import { InvoiceStatus } from "@autumn/shared";
import { createRawAutumnOperationTools } from "../../../src/tools/index.js";
import {
	invoices,
	keepInvoicesMatchingIdFilters,
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

test("an API that ignored an ID filter yields no invoices, not unrelated ones", () => {
	const unfiltered = {
		list: [
			{ id: "inv_newest", stripe_id: "in_newest" },
			{ id: "inv_older", stripe_id: "in_older" },
		],
		next_cursor: "cursor_1",
	};

	expect(
		keepInvoicesMatchingIdFilters({
			request: { stripe_id: "in_missing" },
			result: unfiltered,
		}),
	).toEqual({ list: [], next_cursor: null });
	expect(
		keepInvoicesMatchingIdFilters({
			request: { invoice_id: "inv_older" },
			result: unfiltered,
		}),
	).toEqual({
		list: [{ id: "inv_older", stripe_id: "in_older" }],
		next_cursor: null,
	});
	expect(
		keepInvoicesMatchingIdFilters({
			request: { customer_id: "cus_1" },
			result: unfiltered,
		}),
	).toBe(unfiltered);
});
