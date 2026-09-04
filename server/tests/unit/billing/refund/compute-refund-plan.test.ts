import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type {
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

type FakeAutumnInvoice = {
	stripe_id: string;
	total: number;
	refunded_amount: number | null;
	currency: string;
};

const invoiceState: { autumnInvoice: FakeAutumnInvoice | null } = {
	autumnInvoice: null,
};

const stripeState: {
	invoice: Pick<Stripe.Invoice, "status" | "total" | "currency"> | null;
	retrieveCalls: string[];
} = { invoice: null, retrieveCalls: [] };

// Capture the real modules before mocking so afterAll can restore them —
// bun's mock.module leaks across test files otherwise.
const realInvoiceService = {
	...(await import("@/internal/invoices/InvoiceService.js")),
};
const realCreateStripeCli = {
	...(await import("@/external/connect/createStripeCli.js")),
};

mock.module("@/internal/invoices/InvoiceService.js", () => ({
	InvoiceService: {
		getByStripeId: async () => invoiceState.autumnInvoice,
	},
}));

mock.module("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async (invoiceId: string) => {
				stripeState.retrieveCalls.push(invoiceId);
				return stripeState.invoice;
			},
		},
	}),
}));

import { computeRefundPlan } from "@/internal/billing/v2/compute/finalize/computeRefundPlan.js";

const LATEST_INVOICE_ID = "in_synced_123";

const ctx = {
	db: {},
	org: { id: "org_1" },
	env: "sandbox",
	logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const buildBillingContext = ({
	refundLastPayment,
	latestInvoice = LATEST_INVOICE_ID,
}: {
	refundLastPayment: "full" | "prorated" | undefined;
	latestInvoice?: string | null;
}) =>
	({
		refundLastPayment,
		stripeSubscription: {
			id: "sub_123",
			latest_invoice: latestInvoice,
		},
	}) as unknown as UpdateSubscriptionBillingContext;

const refundLineItem = ({ amount }: { amount: number }) =>
	({
		amount,
		context: { direction: "refund", price: { id: "pr_1" } },
	}) as unknown as LineItem;

const chargeLineItem = ({ amount }: { amount: number }) =>
	({
		amount,
		context: { direction: "charge", price: { id: "pr_2" } },
	}) as unknown as LineItem;

afterEach(() => {
	invoiceState.autumnInvoice = null;
	stripeState.invoice = null;
	stripeState.retrieveCalls = [];
});

afterAll(() => {
	mock.module(
		"@/internal/invoices/InvoiceService.js",
		() => realInvoiceService,
	);
	mock.module(
		"@/external/connect/createStripeCli.js",
		() => realCreateStripeCli,
	);
});

describe("computeRefundPlan", () => {
	test("prefers the Autumn invoice and never calls Stripe", async () => {
		invoiceState.autumnInvoice = {
			stripe_id: LATEST_INVOICE_ID,
			total: 50,
			refunded_amount: 10,
			currency: "usd",
		};

		const { lineItems, refundPlan } = await computeRefundPlan({
			ctx,
			billingContext: buildBillingContext({ refundLastPayment: "full" }),
			lineItems: [
				refundLineItem({ amount: -20 }),
				chargeLineItem({ amount: 5 }),
			],
		});

		expect(stripeState.retrieveCalls).toEqual([]);
		expect(refundPlan?.amount).toBe(40);
		expect(refundPlan?.invoice.current_refunded_amount).toBe(10);
		// Refund line items are consumed by the refund, not billed as credits
		expect(lineItems).toHaveLength(1);
	});

	test("falls back to the Stripe invoice when Autumn has no mirrored row", async () => {
		stripeState.invoice = {
			status: "paid",
			total: 5000,
			currency: "usd",
		} as Stripe.Invoice;

		const { refundPlan } = await computeRefundPlan({
			ctx,
			billingContext: buildBillingContext({ refundLastPayment: "full" }),
			lineItems: [refundLineItem({ amount: -50 })],
		});

		expect(stripeState.retrieveCalls).toEqual([LATEST_INVOICE_ID]);
		expect(refundPlan).toEqual({
			amount: 50,
			invoice: {
				stripe_id: LATEST_INVOICE_ID,
				total: 50,
				current_refunded_amount: 0,
				currency: "usd",
			},
		});
	});

	test("caps a prorated fallback refund at the invoice total", async () => {
		stripeState.invoice = {
			status: "paid",
			total: 5000,
			currency: "usd",
		} as Stripe.Invoice;

		const { refundPlan } = await computeRefundPlan({
			ctx,
			billingContext: buildBillingContext({ refundLastPayment: "prorated" }),
			lineItems: [
				refundLineItem({ amount: -30 }),
				refundLineItem({ amount: -5 }),
			],
		});

		expect(refundPlan?.amount).toBe(35);
	});

	test("skips the refund when the Stripe invoice is not paid", async () => {
		stripeState.invoice = {
			status: "draft",
			total: 5000,
			currency: "usd",
		} as Stripe.Invoice;

		const { refundPlan } = await computeRefundPlan({
			ctx,
			billingContext: buildBillingContext({ refundLastPayment: "full" }),
			lineItems: [refundLineItem({ amount: -50 })],
		});

		expect(refundPlan).toBeUndefined();
	});

	test("is a no-op when refund_last_payment is not requested", async () => {
		const lineItems = [refundLineItem({ amount: -50 })];

		const result = await computeRefundPlan({
			ctx,
			billingContext: buildBillingContext({ refundLastPayment: undefined }),
			lineItems,
		});

		expect(result.refundPlan).toBeUndefined();
		expect(result.lineItems).toEqual(lineItems);
	});
});
