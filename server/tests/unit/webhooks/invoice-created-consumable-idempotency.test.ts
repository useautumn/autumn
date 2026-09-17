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
 *  - every pending line (usage + credit) goes out in ONE invoices.addLines call
 *  - lines already on the invoice (matched by metadata.autumn_line_item_id) are
 *    skipped for usage lines too, so usage line ids must be scoped to the invoice
 *  - a non-draft invoice with missing lines throws BEFORE any balance mutation
 *  - a non-draft invoice with every line present continues with balance resets
 *  - if Stripe's addLines response lacks a requested line, throw before resets
 *  - the addLines request key is derived from the observed invoice state and
 *    the exact request, so an identical redelivery dedupes at Stripe while a
 *    changed request gets a fresh key; a replayed cached failure is retried
 *    under a key salted with Stripe's original request id, and each delivery
 *    walks that chain identically until a fresh attempt is made
 *  - more than 100 pending lines are sent in batches
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { buildInvoiceAddLinesIdempotencyKey } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/buildInvoiceAddLinesIdempotencyKey";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

type MockLineItem = {
	id: string;
	context: {
		customerProduct: { id: string };
		customerPrice: { id: string };
		customerEntitlement: { id: string };
	};
};

const addLinesCalls: Array<{
	invoiceId: string;
	lines: Array<{ metadata?: { autumn_line_item_id?: string } }>;
	idempotencyKey?: string;
}> = [];
const landedLineItemIds: string[] = [];
const createInvoiceItemCalls: unknown[] = [];
const batchUpdateCalls: unknown[] = [];
const arrearLineItemArgs: Array<Record<string, unknown>> = [];

const makeLineItem = (id: string): MockLineItem => ({
	id,
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
let addLinesShouldDropLastLine = false;
let addLinesFailures: unknown[] = [];

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
			[...liveStripeLineItemIds, ...landedLineItemIds].map((lineItemId) => ({
				metadata: { autumn_line_item_id: lineItemId },
			})),
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams",
	() => ({
		lineItemsToInvoiceAddLinesParams: ({
			lineItems,
		}: {
			lineItems: Array<{ id: string }>;
		}) =>
			lineItems.map((lineItem, index) => ({
				amount: (index + 1) * 100,
				metadata: { autumn_line_item_id: lineItem.id },
			})),
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps",
	() => ({
		addStripeInvoiceLines: async (args: {
			invoiceId: string;
			lines: Array<{ metadata?: { autumn_line_item_id?: string } }>;
			idempotencyKey?: string;
		}) => {
			addLinesCalls.push(args);
			const failure = addLinesFailures.shift();
			if (failure) throw failure;
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
		error: () => undefined,
	},
} as never;

const sentLineItemIds = () =>
	addLinesCalls.flatMap((call) =>
		call.lines.map((line) => line.metadata?.autumn_line_item_id),
	);

describe("invoice.created consumable idempotency", () => {
	beforeEach(() => {
		addLinesCalls.length = 0;
		createInvoiceItemCalls.length = 0;
		batchUpdateCalls.length = 0;
		arrearLineItemArgs.length = 0;
		consumableLineItems = usageLineItems;
		invoiceCreditLineItems = creditLineItems;
		liveStripeLineItemIds = [];
		landedLineItemIds.length = 0;
		addLinesShouldDropLastLine = false;
		addLinesFailures = [];
	});

	test("retries once under a key salted with the replayed request id when Stripe replays a cached failure", async () => {
		addLinesFailures = [
			Object.assign(new Error("lock_timeout"), {
				headers: {
					"idempotent-replayed": "true",
					"original-request": "req_orig",
				},
			}),
		];

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(addLinesCalls).toHaveLength(2);
		expect(addLinesCalls[1]?.idempotencyKey).toBe(
			`${addLinesCalls[0]?.idempotencyKey}:req_orig`,
		);
		expect(addLinesCalls[1]?.lines).toHaveLength(3);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("does not retry a replayed failure that carries no original request id", async () => {
		addLinesFailures = [
			Object.assign(new Error("lock_timeout"), {
				headers: { "idempotent-replayed": "true", "request-id": "req_replay" },
			}),
		];

		await expect(
			processConsumablePricesForInvoiceCreated({
				ctx,
				eventContext: makeEventContext(),
			}),
		).rejects.toThrow("lock_timeout");

		expect(addLinesCalls).toHaveLength(1);
		expect(batchUpdateCalls).toEqual([]);
	});

	test("walks a chain of replayed failures, salting each step with that replay's original request id", async () => {
		const replayed = (originalRequest: string) =>
			Object.assign(new Error("lock_timeout"), {
				headers: {
					"idempotent-replayed": "true",
					"original-request": originalRequest,
				},
			});
		addLinesFailures = [replayed("req_1"), replayed("req_2")];

		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		const baseKey = addLinesCalls[0]?.idempotencyKey;
		expect(addLinesCalls.map((call) => call.idempotencyKey)).toEqual([
			baseKey,
			`${baseKey}:req_1`,
			`${baseKey}:req_2`,
		]);
		expect(batchUpdateCalls).toHaveLength(1);
	});

	test("stops walking replayed failures after a bounded number of links", async () => {
		const replayed = (originalRequest: string) =>
			Object.assign(new Error("lock_timeout"), {
				headers: {
					"idempotent-replayed": "true",
					"original-request": originalRequest,
				},
			});
		addLinesFailures = Array.from({ length: 20 }, (_, index) =>
			replayed(`req_${index}`),
		);

		await expect(
			processConsumablePricesForInvoiceCreated({
				ctx,
				eventContext: makeEventContext(),
			}),
		).rejects.toThrow("lock_timeout");

		expect(addLinesCalls).toHaveLength(17);
		expect(batchUpdateCalls).toEqual([]);
	});

	test("propagates a fresh (non-replayed) Stripe error without retrying", async () => {
		addLinesFailures = [
			Object.assign(new Error("rate limit"), {
				headers: { "request-id": "req_fresh" },
			}),
		];

		await expect(
			processConsumablePricesForInvoiceCreated({
				ctx,
				eventContext: makeEventContext(),
			}),
		).rejects.toThrow("rate limit");

		expect(addLinesCalls).toHaveLength(1);
		expect(batchUpdateCalls).toEqual([]);
	});

	test("keys the request on the observed invoice state and params so an identical redelivery shares the key", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const firstKey = addLinesCalls[0]?.idempotencyKey;

		landedLineItemIds.length = 0;
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const secondKey = addLinesCalls[1]?.idempotencyKey;

		expect(firstKey?.startsWith("autumn:invoice.addLines:invoice_retry:")).toBe(
			true,
		);
		expect(secondKey).toBe(firstKey);
	});

	test("uses a fresh key when the line params changed, so a cached failure cannot pin a params mismatch", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const firstKey = addLinesCalls[0]?.idempotencyKey;

		// More usage was tracked before Stripe redelivered: one line dropped out.
		landedLineItemIds.length = 0;
		consumableLineItems = [usageLineItems[0]!];
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(addLinesCalls[1]?.idempotencyKey).not.toBe(firstKey);
	});

	test("changes the request key once the invoice state it observed has changed", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const firstKey = addLinesCalls[0]?.idempotencyKey;

		// A later delivery sees the first usage line already on the invoice.
		landedLineItemIds.length = 0;
		liveStripeLineItemIds = [usageLineItems[0]!.id];
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});

		expect(addLinesCalls[1]?.idempotencyKey).not.toBe(firstKey);
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
		expect(new Set(addLinesCalls.map((call) => call.idempotencyKey)).size).toBe(
			3,
		);
		// Each later batch is keyed on the invoice as it was after the previous
		// batch landed, so a second delivery that read that state shares the key.
		expect(addLinesCalls[1]?.idempotencyKey).toBe(
			buildInvoiceAddLinesIdempotencyKey({
				invoiceId: "invoice_retry",
				existingLineItemIds: consumableLineItems
					.slice(0, 100)
					.map((lineItem) => lineItem.id),
				requestParams: addLinesCalls[1]?.lines,
			}),
		);
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
