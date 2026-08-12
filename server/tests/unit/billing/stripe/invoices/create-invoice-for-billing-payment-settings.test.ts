import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	BillingContext,
	InvoicePaymentMethod,
	StripeInvoiceAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

const mockState = {
	createCalls: [] as Stripe.InvoiceCreateParams[],
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		invoices: {
			create: async (params: Stripe.InvoiceCreateParams) => {
				mockState.createCalls.push(params);
				return { id: "in_created" };
			},
			addLines: async (invoiceId: string) => ({ id: invoiceId }),
			finalizeInvoice: async (invoiceId: string) => ({
				id: invoiceId,
				status: "paid",
			}),
		},
	}),
}));

const { createInvoiceForBilling } = await import(
	"@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling"
);

const ctx = {
	org: {
		id: "org_123",
		config: { automatic_tax: false },
		default_currency: "usd",
	},
	env: "sandbox",
} as unknown as AutumnContext;

const stripeInvoiceAction = {
	addLineParams: { lines: [{ amount: 1000, currency: "usd" }] },
} as unknown as StripeInvoiceAction;

const makeBillingContext = ({
	invoiceMode = true,
	paymentMethodTypes,
}: {
	invoiceMode?: boolean;
	paymentMethodTypes?: InvoicePaymentMethod[];
}) =>
	({
		fullCustomer: { currency: "usd" },
		stripeCustomer: { id: "cus_123" },
		...(invoiceMode && {
			invoiceMode: {
				finalizeInvoice: false,
				enableProductImmediately: true,
				paymentMethodTypes,
			},
		}),
	}) as unknown as BillingContext;

describe("createInvoiceForBilling payment settings", () => {
	beforeEach(() => {
		mockState.createCalls = [];
	});

	test("applies the resolved payment method types in invoice mode", async () => {
		await createInvoiceForBilling({
			ctx,
			billingContext: makeBillingContext({
				paymentMethodTypes: ["card", "customer_balance"],
			}),
			stripeInvoiceAction,
		});

		expect(mockState.createCalls[0]?.collection_method).toBe("send_invoice");
		expect(mockState.createCalls[0]?.payment_settings).toEqual({
			payment_method_types: ["card", "customer_balance"],
		});
	});

	test("sends no payment settings in invoice mode when nothing is resolved", async () => {
		await createInvoiceForBilling({
			ctx,
			billingContext: makeBillingContext({}),
			stripeInvoiceAction,
		});

		expect(mockState.createCalls[0]?.collection_method).toBe("send_invoice");
		expect(mockState.createCalls[0]?.payment_settings).toBeUndefined();
	});

	test("sends no payment settings outside invoice mode", async () => {
		await createInvoiceForBilling({
			ctx,
			billingContext: makeBillingContext({ invoiceMode: false }),
			stripeInvoiceAction,
		});

		expect(mockState.createCalls[0]?.collection_method).toBe(
			"charge_automatically",
		);
		expect(mockState.createCalls[0]?.payment_settings).toBeUndefined();
	});
});

afterAll(() => {
	mock.restore();
});
