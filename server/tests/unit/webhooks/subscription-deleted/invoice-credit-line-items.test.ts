import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const eventContextCalls: Array<Record<string, unknown>> = [];
const invoiceLineItemCalls: unknown[][] = [];
const createInvoiceCalls: Array<Record<string, unknown>> = [];

const invoiceCreditLineItems = [
	{ id: "invoice_credit_debit", amount: 40 },
	{ id: "invoice_credit_offset", amount: -40 },
];

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	eventContextToArrearLineItems: async (args: Record<string, unknown>) => {
		eventContextCalls.push(args);
		return {
			lineItems: [],
			invoiceCreditLineItems,
			updateCustomerEntitlements: [],
			billingContext: {},
		};
	},
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams",
	() => ({
		lineItemsToInvoiceAddLinesParams: ({
			lineItems,
		}: {
			lineItems: unknown[];
		}) => {
			invoiceLineItemCalls.push(lineItems);
			return lineItems;
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling",
	() => ({
		createInvoiceForBilling: async (args: Record<string, unknown>) => {
			createInvoiceCalls.push(args);
			return { paid: true, invoice: { id: "invoice_final" } };
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling",
	() => ({ upsertInvoiceFromBilling: async () => undefined }),
);

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService",
	() => ({ CusEntService: { batchUpdate: async () => undefined } }),
);

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer",
	() => ({ deleteCachedFullCustomer: async () => undefined }),
);

const { processConsumablePricesForSubscriptionDeleted } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionDeleted/tasks/processConsumablePricesForSubscriptionDeleted.js?invoiceCredits"
);

const ctx = {
	org: { id: "org_test", config: { disable_overage_billing: false } },
	env: AppEnv.Sandbox,
	logger: { info: () => undefined },
} as never;

const eventContext = {
	stripeSubscription: {
		id: "subscription_final",
		ended_at: 2_000,
		trial_end: null,
		items: {
			data: [
				{
					current_period_end: 2_000,
					price: { recurring: { usage_type: "licensed" } },
				},
			],
		},
	},
	fullCustomer: {
		id: "customer_test",
		internal_id: "customer_internal_test",
	},
	customerProducts: [],
} as never;

describe("subscription.deleted invoice-credit line items", () => {
	beforeEach(() => {
		eventContextCalls.length = 0;
		invoiceLineItemCalls.length = 0;
		createInvoiceCalls.length = 0;
	});

	test("adds the shared invoice-credit debit and offset lines to the final invoice", async () => {
		await processConsumablePricesForSubscriptionDeleted({ ctx, eventContext });

		expect(eventContextCalls[0]).toMatchObject({
			invoiceCredits: {
				idempotencyScope: "subscription_final",
				fullyOffsetOverage: false,
			},
		});
		expect(invoiceLineItemCalls).toEqual([invoiceCreditLineItems]);
		expect(createInvoiceCalls).toHaveLength(1);
	});
});

afterAll(() => {
	mock.restore();
});
