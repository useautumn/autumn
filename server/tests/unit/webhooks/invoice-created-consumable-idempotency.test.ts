import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const createInvoiceItemCalls: Array<{
	idempotencyKeys?: string[];
	invoiceItems?: Array<{ metadata?: { autumn_line_item_id?: string } }>;
}> = [];

const regularLineItems = [
	{
		id: "invoice_li_random_first",
		context: {
			customerProduct: { id: "customer_product_test" },
			customerPrice: { id: "customer_price_first" },
			customerEntitlement: { id: "customer_entitlement_first" },
		},
	},
	{
		id: "invoice_li_random_second",
		context: {
			customerProduct: { id: "customer_product_test" },
			customerPrice: { id: "customer_price_second" },
			customerEntitlement: { id: "customer_entitlement_second" },
		},
	},
];

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	eventContextToArrearLineItems: async () => ({
		lineItems: regularLineItems,
		invoiceCreditLineItems: [],
		updateCustomerEntitlements: [],
	}),
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToCreateInvoiceItemsParams",
	() => ({
		lineItemsToCreateInvoiceItemsParams: ({
			lineItems,
		}: {
			lineItems: Array<{ id: string }>;
		}) =>
			lineItems.map((lineItem, index) => ({
				customer: "stripe_customer",
				amount: (index + 1) * 100,
				metadata: { autumn_line_item_id: lineItem.id },
			})),
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps",
	() => ({
		createStripeInvoiceItems: async (args: { idempotencyKeys?: string[] }) => {
			createInvoiceItemCalls.push(args);
			return [];
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService",
	() => ({ CusEntService: { batchUpdate: async () => undefined } }),
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
	existingLineItemIds = [],
}: {
	existingLineItemIds?: string[];
} = {}) =>
	({
		stripeInvoice: {
			id: "invoice_retry",
			billing_reason: "subscription_cycle",
			period_end: 2_000,
			lines: {
				has_more: false,
				data: existingLineItemIds.map((lineItemId) => ({
					metadata: { autumn_line_item_id: lineItemId },
				})),
			},
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
	logger: { info: () => undefined },
} as never;

describe("invoice.created consumable idempotency", () => {
	beforeEach(() => {
		createInvoiceItemCalls.length = 0;
	});

	test("uses stable unique keys for ordinary usage items across webhook retries", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const firstKeys = createInvoiceItemCalls[0]?.idempotencyKeys;

		createInvoiceItemCalls.length = 0;
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const retryKeys = createInvoiceItemCalls[0]?.idempotencyKeys;

		expect(firstKeys).toHaveLength(2);
		expect(new Set(firstKeys).size).toBe(2);
		expect(firstKeys?.every((key) => key.startsWith("autumn:usage:"))).toBe(
			true,
		);
		expect(retryKeys).toEqual(firstKeys);
	});

	test("does not recreate an invoice item already added by a partial delivery", async () => {
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext(),
		});
		const firstCall = createInvoiceItemCalls[0];
		const firstLineItemIds = firstCall?.invoiceItems?.map(
			(invoiceItem) => invoiceItem.metadata?.autumn_line_item_id,
		);

		createInvoiceItemCalls.length = 0;
		await processConsumablePricesForInvoiceCreated({
			ctx,
			eventContext: makeEventContext({
				existingLineItemIds: [firstLineItemIds?.[0] ?? ""],
			}),
		});

		expect(createInvoiceItemCalls).toHaveLength(1);
		expect(createInvoiceItemCalls[0]?.invoiceItems).toHaveLength(1);
		expect(
			createInvoiceItemCalls[0]?.invoiceItems?.[0]?.metadata
				?.autumn_line_item_id,
		).toBe(firstLineItemIds?.[1]);
		expect(createInvoiceItemCalls[0]?.idempotencyKeys).toEqual(
			firstCall?.idempotencyKeys?.slice(1),
		);
	});
});

afterAll(() => {
	mock.restore();
});
