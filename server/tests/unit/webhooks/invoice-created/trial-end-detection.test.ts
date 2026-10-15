/**
 * TDD test for invoice.created mistaking a subscription's final invoice for
 * its trial-end invoice.
 *
 * Incident (Maple, 2026-10-07): a customer trialed Aug 24 -> Sep 7, paid for
 * Sep 7 -> Oct 7, and cancelled at period end. Stripe's final
 * subscription_cycle invoice on Oct 7 came out at $0 and ~$640 of overage was
 * never billed. subscription.deleted defers metered subscriptions to that
 * final invoice, but invoice.created decided the "trial just ended" because
 * the ending subscription's current_period_start (Sep 7) still equals
 * trial_end; on a normal renewal Stripe has already advanced the period.
 *
 * Red-failure mode (current behavior):
 *  - the final invoice after a trial-then-paid period skips all usage lines
 *
 * Green-success criteria (after fix):
 *  - trial detection keys off the invoice's own period: only the invoice whose
 *    period_end is trial_end skips usage
 *  - the final invoice of a cancelled subscription bills usage
 *  - a regular renewal after a trial bills usage
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const AUG_24 = 1_787_529_600;
const SEP_7 = 1_788_739_200;
const OCT_7 = 1_791_331_200;
const NOV_7 = 1_794_009_600;

const usageLineItem = {
	id: "invoice_li_usage_invoice_trial_traces",
	amount: 101.77,
	amountAfterDiscounts: 101.77,
	description: "Traces overage",
	context: {
		discountable: true,
		currency: "usd",
		customerProduct: { id: "customer_product_test" },
		customerPrice: { id: "customer_price_traces" },
		customerEntitlement: { id: "customer_entitlement_traces" },
	},
};

const addLinesCalls: Array<{
	lines: Array<{ metadata?: { autumn_line_item_id?: string } }>;
}> = [];

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	// Mirrors the real helper: a skip-all filter and includeLineItems=false
	// both mean no usage lines come back.
	eventContextToArrearLineItems: async (args: {
		invoiceCredits?: { includeLineItems?: boolean };
	}) => ({
		lineItems:
			args.invoiceCredits?.includeLineItems === false ? [] : [usageLineItem],
		invoiceCreditLineItems: [],
		updateCustomerEntitlements: [],
	}),
}));

await mockModuleWithRestore(
	"@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js",
	() => ({ getStripeInvoiceLineItems: async () => [] }),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams",
	() => ({
		lineItemsToInvoiceAddLinesParams: ({
			lineItems,
		}: {
			lineItems: Array<typeof usageLineItem>;
		}) =>
			lineItems.map((lineItem) => ({
				amount: lineItem.amount,
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
		}) => {
			addLinesCalls.push(args);
			return {
				id: args.invoiceId,
				lines: {
					has_more: false,
					data: args.lines.map((line) => ({ metadata: line.metadata })),
				},
			};
		},
		createStripeInvoiceItems: async () => [],
		updateStripeInvoiceItem: async () => ({}),
		updateStripeInvoiceLine: async () => ({}),
	}),
);

const { processConsumablePricesForInvoiceCreated } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processConsumablePricesForInvoiceCreated.js?trial-end-detection"
);

const ctx = {
	org: { id: "org_test", config: { disable_overage_billing: false } },
	env: AppEnv.Sandbox,
	stripeCli: {},
	logger: {
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
	},
} as never;

const makeEventContext = ({
	invoicePeriodStart,
	invoicePeriodEnd,
	subscriptionPeriodStart,
	subscriptionPeriodEnd,
	trialEnd,
}: {
	invoicePeriodStart: number;
	invoicePeriodEnd: number;
	subscriptionPeriodStart: number;
	subscriptionPeriodEnd: number;
	trialEnd: number | null;
}) =>
	({
		stripeInvoice: {
			id: "invoice_trial",
			status: "draft",
			billing_reason: "subscription_cycle",
			period_start: invoicePeriodStart,
			period_end: invoicePeriodEnd,
			lines: { has_more: false, data: [] },
		},
		stripeSubscription: {
			billing_cycle_anchor: SEP_7,
			trial_end: trialEnd,
			items: {
				data: [
					{
						current_period_start: subscriptionPeriodStart,
						current_period_end: subscriptionPeriodEnd,
					},
				],
			},
		},
		results: { customerStateChanged: false },
		stripeCustomer: { id: "stripe_customer" },
		stripeSubscriptionId: "sub_test",
		fullCustomer: { id: "customer_test", internal_id: "customer_internal" },
	}) as never;

const billedUsageLineIds = async (eventContext: never) => {
	await processConsumablePricesForInvoiceCreated({
		ctx,
		eventContext,
		plan: createAutumnBillingPlanBuilder({ customerId: "customer_test" }),
	});
	return addLinesCalls.flatMap((call) =>
		call.lines.map((line) => line.metadata?.autumn_line_item_id),
	);
};

describe("invoice.created trial-end detection", () => {
	beforeEach(() => {
		addLinesCalls.length = 0;
	});

	test("bills usage on the final invoice of a subscription cancelled at period end after its trial", async () => {
		// Ending subscription: Stripe does not advance the period, so it still
		// reads Sep 7 -> Oct 7 and current_period_start equals trial_end.
		const lineIds = await billedUsageLineIds(
			makeEventContext({
				invoicePeriodStart: SEP_7,
				invoicePeriodEnd: OCT_7,
				subscriptionPeriodStart: SEP_7,
				subscriptionPeriodEnd: OCT_7,
				trialEnd: SEP_7,
			}),
		);

		expect(lineIds).toEqual([usageLineItem.id]);
	});

	test("skips usage on the invoice that closes the trial", async () => {
		const lineIds = await billedUsageLineIds(
			makeEventContext({
				invoicePeriodStart: AUG_24,
				invoicePeriodEnd: SEP_7,
				subscriptionPeriodStart: SEP_7,
				subscriptionPeriodEnd: OCT_7,
				trialEnd: SEP_7,
			}),
		);

		expect(lineIds).toEqual([]);
	});

	test("bills usage on a regular renewal after a trial", async () => {
		const lineIds = await billedUsageLineIds(
			makeEventContext({
				invoicePeriodStart: SEP_7,
				invoicePeriodEnd: OCT_7,
				subscriptionPeriodStart: OCT_7,
				subscriptionPeriodEnd: NOV_7,
				trialEnd: SEP_7,
			}),
		);

		expect(lineIds).toEqual([usageLineItem.id]);
	});

	test("bills usage on a subscription that never trialed", async () => {
		const lineIds = await billedUsageLineIds(
			makeEventContext({
				invoicePeriodStart: SEP_7,
				invoicePeriodEnd: OCT_7,
				subscriptionPeriodStart: SEP_7,
				subscriptionPeriodEnd: OCT_7,
				trialEnd: null,
			}),
		);

		expect(lineIds).toEqual([usageLineItem.id]);
	});
});
