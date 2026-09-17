/**
 * TDD test for invoice.created line creation surviving Stripe webhook retries.
 *
 * Incident (Surge sandbox, 2026-09-14): a subscription_cycle invoice.created
 * handler fired usage + invoice-credit lines as one parallel burst of
 * invoiceItems.create calls. A 429 crashed the handler, Stripe retried, and
 * the retry re-created the 5 usage lines (random idempotency keys, no
 * existing-line check) while the credit lines replayed a cached 429 under their
 * deterministic keys and never landed. The customer was over-billed ~$1.7k.
 *
 * Red-failure mode (current behavior):
 *  - usage lines are created via createStripeInvoiceItems with no dedupe
 *  - credit lines are created in a second burst with per-line stable keys
 *  - a retry against a finalized invoice throws and skips balance resets
 *
 * Green-success criteria (after fix):
 *  - every pending line (usage + credit) goes out via invoices.addLines
 *  - lines already on the invoice (matched by metadata.autumn_line_item_id) are
 *    skipped for usage lines too, so usage line ids must be scoped to the invoice
 *  - a non-draft invoice with missing lines throws BEFORE any balance mutation
 *  - a non-draft invoice with every line present continues with balance resets
 *  - if Stripe's addLines response lacks a requested line, throw before resets
 *  - more than 100 pending lines are sent in batches
 *  - a line already on a draft invoice whose amount is stale (usage grew
 *    between attempts) is updated so the reset stays correct; on a finalized
 *    invoice the delta is logged for remediation
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

type MockLineItem = {
	id: string;
	amount: number;
	context: {
		customerProduct: { id: string };
		customerPrice: { id: string };
		customerEntitlement: { id: string };
	};
};

const addLinesCalls: Array<{
	invoiceId: string;
	lines: Array<{ metadata?: { autumn_line_item_id?: string } }>;
}> = [];
const landedLineItemIds: string[] = [];
const updateLineCalls: Array<{
	lineItemId: string;
	params: { amount?: number; metadata?: Record<string, string> };
}> = [];
const errorLogs: string[] = [];
const createInvoiceItemCalls: unknown[] = [];
const batchUpdateCalls: unknown[] = [];
const arrearLineItemArgs: Array<Record<string, unknown>> = [];

const makeLineItem = (id: string, amount = 100): MockLineItem => ({
	id,
	amount,
	context: {
		customerProduct: { id: "customer_product_test" },
		customerPrice: { id: `customer_price_${id}` },
		customerEntitlement: { id: `customer_entitlement_${id}` },
	},
});

const usageLineItems = [
	makeLineItem("invoice_li_usage_invoice_retry_first"),
	makeLineItem("invoice_li_usage_invoice_retry_second"),
];
const creditLineItems = [
	makeLineItem("invoice_li_credit_invoice_retry_entitlement_source"),
];

let consumableLineItems: MockLineItem[] = usageLineItems;
let invoiceCreditLineItems: MockLineItem[] = creditLineItems;
let liveStripeLineItemIds: string[] = [];
let liveStripeLineAmounts: Record<string, string> = {};
let addLinesShouldDropLastLine = false;

const liveLineFor = (lineItemId: string) => ({
	id: `il_${lineItemId}`,
	metadata: {
		autumn_line_item_id: lineItemId,
		...(liveStripeLineAmounts[lineItemId]
			? { autumn_line_amount: liveStripeLineAmounts[lineItemId] }
			: {}),
	},
});

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	eventContextToArrearLineItems: async (args: Record<string, unknown>) => {
		arrearLineItemArgs.push(args);
		return {
			lineItems: consumableLineItems,
			invoiceCreditLineItems,
			updateCustomerEntitlements: [],
		};
	},
}));

await mockModuleWithRestore(
	"@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js",
	() => ({
		getStripeInvoiceLineItems: async () =>
			[...liveStripeLineItemIds, ...landedLineItemIds].map(liveLineFor),
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams",
	() => ({
		lineItemsToInvoiceAddLinesParams: ({
			lineItems,
		}: {
			lineItems: MockLineItem[];
		}) =>
			lineItems.map((lineItem) => ({
				amount: lineItem.amount,
				metadata: {
					autumn_line_item_id: lineItem.id,
					autumn_line_amount: String(lineItem.amount),
				},
			})),
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToMetadata",
	() => ({
		lineItemToMetadata: ({ lineItem }: { lineItem: MockLineItem }) => ({
			autumn_line_item_id: lineItem.id,
			autumn_line_amount: String(lineItem.amount),
		}),
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps",
	() => ({
		addStripeInvoiceLines: async (args: {
			invoiceId: string;
			lines: Array<{ metadata?: { autumn_line_item_id?: string } }>;
		}) => {
			addLinesCalls.push(args);
			const landedLines = addLinesShouldDropLastLine
				? args.lines.slice(0, -1)
				: args.lines;
			for (const line of landedLines) {
				const lineItemId = line.metadata?.autumn_line_item_id;
				if (lineItemId) landedLineItemIds.push(lineItemId);
			}
			return {
				id: args.invoiceId,
				lines: {
					has_more: false,
					data: [
						...liveStripeLineItemIds.map((lineItemId) => ({
							metadata: { autumn_line_item_id: lineItemId },
						})),
						...landedLines.map((line) => ({ metadata: line.metadata })),
					],
				},
			};
		},
		createStripeInvoiceItems: async (args: unknown) => {
			createInvoiceItemCalls.push(args);
			return [];
		},
		updateStripeInvoiceLine: async (args: {
			lineItemId: string;
			params: { amount?: number; metadata?: Record<string, string> };
		}) => {
			updateLineCalls.push({
				lineItemId: args.lineItemId,
				params: args.params,
			});
			return { id: args.lineItemId };
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService",
	() => ({
		CusEntService: {
			batchUpdate: async (args: unknown) => {
				batchUpdateCalls.push(args);
			},
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer",
	() => ({ deleteCachedFullCustomer: async () => undefined }),
);

const { processConsumablePricesForInvoiceCreated } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processConsumablePricesForInvoiceCreated.js?idempotency"
);

const makeEventContext = ({
	invoiceStatus = "draft",
}: {
	invoiceStatus?: "draft" | "open" | "paid";
} = {}) =>
	({
		stripeInvoice: {
			id: "invoice_retry",
			status: invoiceStatus,
			billing_reason: "subscription_cycle",
			period_end: 2_000,
			lines: { has_more: false, data: [] },
		},
		stripeSubscription: {
			billing_cycle_anchor: 1_000,
			items: { data: [] },
		},
		stripeCustomer: { id: "stripe_customer" },
		fullCustomer: {
			id: "customer_test",
			internal_id: "customer_internal_test",
		},
	}) as never;

const ctx = {
	org: { id: "org_test", config: { disable_overage_billing: false } },
	env: AppEnv.Sandbox,
	stripeCli: { id: "stripe_client_test" },
	logger: {
		info: () => undefined,
		warn: () => undefined,
		error: (message: string) => {
			errorLogs.push(message);
		},
	},
} as never;

const sentLineItemIds = () =>
	addLinesCalls.flatMap((call) =>
		call.lines.map((line) => line.metadata?.autumn_line_item_id),
	);

describe("invoice.created consumable idempotency", () => {
	beforeEach(() => {
		addLinesCalls.length = 0;
		landedLineItemIds.length = 0;
		createInvoiceItemCalls.length = 0;
		batchUpdateCalls.length = 0;
		arrearLineItemArgs.length = 0;
		consumableLineItems = usageLineItems;
		invoiceCreditLineItems = creditLineItems;
		liveStripeLineItemIds = [];
		liveStripeLineAmounts = {};
		updateLineCalls.length = 0;
		errorLogs.length = 0;
		addLinesShouldDropLastLine = false;
	});

	test("updates an existing draft line whose billed amount is stale after usage grew between attempts", async () => {
		const grown = makeLineItem(usageLineItems[0]!.id, 150);
		consumableLineItems = [grown, usageLineItems[1]!];
		liveStripeLineItemIds = [grown.id];
		liveStripeLineAmounts = { [grown.id]: "100" };

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(updateLineCalls).toEqual([
			{
				lineItemId: `il_${grown.id}`,
				params: {
					amount: 150,
					metadata: {
						autumn_line_item_id: grown.id,
						autumn_line_amount: "150",
					},
				},
			},
		]);
		expect(sentLineItemIds()).toEqual([
			usageLineItems[1]!.id,
			...creditLineItems.map((lineItem) => lineItem.id),
		]);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("leaves an existing line alone when its billed amount still matches", async () => {
		liveStripeLineItemIds = [usageLineItems[0]!.id];
		liveStripeLineAmounts = { [usageLineItems[0]!.id]: "100" };

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(updateLineCalls).toEqual([]);
	});

	test("logs a stale line on a finalized invoice for remediation and still resets balances", async () => {
		const grown = makeLineItem(usageLineItems[0]!.id, 150);
		consumableLineItems = [grown, usageLineItems[1]!];
		liveStripeLineItemIds = [
			grown.id,
			usageLineItems[1]!.id,
			...creditLineItems.map((lineItem) => lineItem.id),
		];
		liveStripeLineAmounts = { [grown.id]: "100" };

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext({ invoiceStatus: "paid" }),
		});

		expect(updateLineCalls).toEqual([]);
		expect(addLinesCalls).toEqual([]);
		expect(errorLogs.some((message) => message.includes(grown.id))).toBe(true);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("sends usage and credit lines in a single bulk addLines call", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(createInvoiceItemCalls).toEqual([]);
		expect(addLinesCalls).toHaveLength(1);
		expect(addLinesCalls[0]?.invoiceId).toBe("invoice_retry");
		expect(sentLineItemIds()).toEqual([
			...usageLineItems.map((lineItem) => lineItem.id),
			...creditLineItems.map((lineItem) => lineItem.id),
		]);
	});

	test("scopes generated line ids to the invoice so retries produce the same ids", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(arrearLineItemArgs[0]?.idempotencyScope).toBe("invoice_retry");
	});

	test("skips usage lines already on the invoice when the webhook is retried", async () => {
		liveStripeLineItemIds = [usageLineItems[0]!.id];

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(addLinesCalls).toHaveLength(1);
		expect(sentLineItemIds()).toEqual([
			usageLineItems[1]!.id,
			...creditLineItems.map((lineItem) => lineItem.id),
		]);
	});

	test("does not call Stripe when every line already exists, but still resets balances", async () => {
		liveStripeLineItemIds = [
			...usageLineItems.map((lineItem) => lineItem.id),
			...creditLineItems.map((lineItem) => lineItem.id),
		];

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(addLinesCalls).toEqual([]);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("throws before resetting balances when a non-draft invoice is missing lines", async () => {
		liveStripeLineItemIds = [usageLineItems[0]!.id];

		await expect(
			processConsumablePricesForInvoiceCreated({
				ctx,
				eventContext: makeEventContext({ invoiceStatus: "open" }),
			}),
		).rejects.toThrow(/no longer a draft/i);

		expect(addLinesCalls).toEqual([]);
		expect(batchUpdateCalls).toEqual([]);
	});

	test("continues balance resets on a non-draft invoice when every line is present", async () => {
		liveStripeLineItemIds = [
			...usageLineItems.map((lineItem) => lineItem.id),
			...creditLineItems.map((lineItem) => lineItem.id),
		];

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext({ invoiceStatus: "paid" }),
		});

		expect(addLinesCalls).toEqual([]);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("throws before resetting balances when Stripe returns without a requested line", async () => {
		addLinesShouldDropLastLine = true;

		await expect(
			processConsumablePricesForInvoiceCreated({
				ctx,
				eventContext: makeEventContext(),
			}),
		).rejects.toThrow(/returned without 1 requested line/i);

		expect(addLinesCalls).toHaveLength(1);
		expect(batchUpdateCalls).toEqual([]);
	});

	test("splits more than 100 pending lines into batches and verifies all of them landed", async () => {
		consumableLineItems = Array.from({ length: 230 }, (_, index) =>
			makeLineItem(`invoice_li_usage_invoice_retry_${index}`),
		);
		invoiceCreditLineItems = [];

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(addLinesCalls.map((call) => call.lines.length)).toEqual([
			100, 100, 30,
		]);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("returns every generated line item for storage even when some were skipped", async () => {
		liveStripeLineItemIds = [usageLineItems[0]!.id];

		const result = await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(result.map((lineItem: MockLineItem) => lineItem.id)).toEqual([
			...usageLineItems.map((lineItem) => lineItem.id),
			...creditLineItems.map((lineItem) => lineItem.id),
		]);
	});
});

afterAll(() => {
	mock.restore();
});
