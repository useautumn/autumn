import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingContext, BillingPlan } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	deletedInvoices: [] as string[],
	retrievedInvoices: [] as string[],
	voidedInvoices: [] as string[],
	updatedInvoices: [] as string[],
};

mock.module("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		invoices: {
			del: async (id: string) => {
				mockState.deletedInvoices.push(id);
			},
			retrieve: async (id: string) => {
				mockState.retrievedInvoices.push(id);
				return { id, status: "open" } as Stripe.Invoice;
			},
			voidInvoice: async (id: string) => {
				mockState.voidedInvoices.push(id);
				return { id, status: "void" } as Stripe.Invoice;
			},
		},
	}),
}));

mock.module(
	"@/internal/billing/v2/providers/stripe/execute/executeStripeInvoiceAction",
	() => ({
		executeStripeInvoiceAction: async () => ({
			stripeInvoice: { id: "inv_123", status: "draft" },
		}),
	}),
);

mock.module(
	"@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction",
	() => ({
		executeStripeSubscriptionAction: async () => {
			throw new Error("subscription failed");
		},
	}),
);

mock.module("@/internal/invoices/actions", () => ({
	invoiceActions: {
		updateFromStripe: async ({
			stripeInvoice,
		}: {
			stripeInvoice: Stripe.Invoice;
		}) => {
			mockState.updatedInvoices.push(stripeInvoice.id);
		},
	},
}));

const { executeStripeBillingPlan } = await import(
	"@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan"
);

const ctx = {
	org: { id: "org_123" },
	env: "sandbox",
	logger: {
		error: mock(() => {}),
		info: mock(() => {}),
		debug: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("executeStripeBillingPlan rollback", () => {
	beforeEach(() => {
		mockState.deletedInvoices = [];
		mockState.retrievedInvoices = [];
		mockState.voidedInvoices = [];
		mockState.updatedInvoices = [];
	});

	test("re-fetches invoice before rollback status branching", async () => {
		const billingContext = {
			fullCustomer: { id: "cus_internal" },
		} as BillingContext;
		const billingPlan = {
			autumn: {
				customerId: "cus_internal",
				insertCustomerProducts: [],
				lineItems: [],
			},
			stripe: {
				invoiceAction: {
					addLineParams: {
						lines: [],
					},
				},
				subscriptionAction: {
					type: "update",
					stripeSubscriptionId: "sub_123",
					params: {},
				},
			},
		} as BillingPlan;

		await expect(
			executeStripeBillingPlan({ ctx, billingContext, billingPlan }),
		).rejects.toThrow("subscription failed");

		expect(mockState.retrievedInvoices).toEqual(["inv_123"]);
		expect(mockState.voidedInvoices).toEqual(["inv_123"]);
		expect(mockState.updatedInvoices).toEqual(["inv_123"]);
		expect(mockState.deletedInvoices).toEqual([]);
	});
});
