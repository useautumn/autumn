import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	StripeBillingStage,
	type BillingContext,
	type BillingPlan,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const mockState = {
	deletedInvoices: [] as string[],
	executedInvoiceActions: 0,
	retrievedInvoices: [] as string[],
	subscriptionErrorApplied: false,
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
		executeStripeInvoiceAction: async () => {
			mockState.executedInvoiceActions += 1;
			return {
				stripeInvoice: { id: "inv_123", status: "draft" },
			};
		},
	}),
);

mock.module(
	"@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction",
	() => ({
		didStripeSubscriptionActionApply: (error: unknown) =>
			Boolean(
				error &&
				typeof error === "object" &&
				(error as { subscriptionApplied?: boolean }).subscriptionApplied,
			),
		executeStripeSubscriptionAction: async () => {
			const error = new Error("subscription failed");
			if (mockState.subscriptionErrorApplied) {
				(error as { subscriptionApplied?: boolean }).subscriptionApplied = true;
			}
			throw error;
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

const { executeStripeBillingPlan } =
	await import("@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan");

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
		mockState.executedInvoiceActions = 0;
		mockState.retrievedInvoices = [];
		mockState.subscriptionErrorApplied = false;
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

	test("rolls back the paid invoice supplied by a deferred invoice resume", async () => {
		await expect(
			executeStripeBillingPlan({
				ctx,
				billingContext: {
					fullCustomer: { id: "cus_internal" },
				} as BillingContext,
				billingPlan: {
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
				} as BillingPlan,
				resumeAfter: StripeBillingStage.InvoiceAction,
				resumeInvoice: { id: "inv_deferred", status: "paid" } as Stripe.Invoice,
			}),
		).rejects.toThrow("subscription failed");

		expect(mockState.executedInvoiceActions).toBe(0);
		expect(mockState.retrievedInvoices).toEqual(["inv_deferred"]);
		expect(mockState.voidedInvoices).toEqual(["inv_deferred"]);
	});

	test("does not roll back invoice side effects after subscription update applied", async () => {
		mockState.subscriptionErrorApplied = true;

		await expect(
			executeStripeBillingPlan({
				ctx,
				billingContext: {
					fullCustomer: { id: "cus_internal" },
				} as BillingContext,
				billingPlan: {
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
				} as BillingPlan,
			}),
		).rejects.toThrow("subscription failed");

		expect(mockState.executedInvoiceActions).toBe(1);
		expect(mockState.retrievedInvoices).toEqual([]);
		expect(mockState.voidedInvoices).toEqual([]);
		expect(mockState.deletedInvoices).toEqual([]);
	});
});
