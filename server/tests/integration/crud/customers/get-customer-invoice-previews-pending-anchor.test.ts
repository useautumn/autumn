/**
 * invoice_previews with a scheduled billing_cycle_anchor pending: the next invoice is the one Stripe's own
 * upcoming invoice for the schedule shows, at the anchor (prorated) or, under none, a full renewal after it.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CustomerExpand,
	ms,
	type SetPlansParamsV0Input,
	stripeToAtmnAmount,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const stripeUpcomingInvoice = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const scheduleId =
		typeof subscription.schedule === "string"
			? subscription.schedule
			: subscription.schedule?.id;
	if (!scheduleId) throw new Error(`${customerId} has no Stripe schedule`);
	const invoice = await ctx.stripeCli.invoices.createPreview({
		customer: subscription.customer as string,
		schedule: scheduleId,
	});
	// Line periods cover the billed window (an anchor's extension starts at the old period end), so date it by `created`.
	return {
		invoiceAt: invoice.created * 1000,
		total: stripeToAtmnAmount({ amount: invoice.total, currency: "usd" }),
	};
};

const setPendingAnchor = async ({
	customerId,
	prorationBehavior,
}: {
	customerId: string;
	prorationBehavior?: "none";
}) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 5 }),
		],
	});
	const anchorMs = scenario.advancedTo + ms.days(10);
	await scenario.autumnV2_4.billing.setPlans({
		customer_id: customerId,
		phases: [
			{
				billing_cycle_anchor: anchorMs,
				starts_at: scenario.advancedTo,
				...(prorationBehavior && { proration_behavior: prorationBehavior }),
				plans: [{ plan_id: pro.id }],
			},
		],
	} satisfies SetPlansParamsV0Input);

	const customer = await scenario.autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{ expand: [CustomerExpand.InvoicePreviews] },
	);
	const stripeInvoice = await stripeUpcomingInvoice({
		ctx: scenario.ctx,
		customerId,
	});
	return { anchorMs, preview: customer.invoice_previews?.[0], stripeInvoice };
};

test.concurrent(
	`${chalk.yellowBright("get-customer: invoice_previews shows the prorated invoice at a pending anchor")}`,
	async () => {
		const { anchorMs, preview, stripeInvoice } = await setPendingAnchor({
			customerId: "invoice-previews-pending-anchor",
		});

		expect(stripeInvoice.invoiceAt).toBe(truncateMsToSecondPrecision(anchorMs));
		expect({
			invoiceAt: preview && truncateMsToSecondPrecision(preview.invoice_at),
			total: preview?.total,
		}).toEqual(stripeInvoice);
	},
);

test.concurrent(
	`${chalk.yellowBright("get-customer: invoice_previews under none skips the anchor and shows the full renewal after it")}`,
	async () => {
		const { anchorMs, preview, stripeInvoice } = await setPendingAnchor({
			customerId: "invoice-previews-pending-anchor-none",
			prorationBehavior: "none",
		});

		expect(stripeInvoice.invoiceAt).toBeGreaterThan(anchorMs);
		expect({
			invoiceAt: preview && truncateMsToSecondPrecision(preview.invoice_at),
			total: preview?.total,
		}).toEqual(stripeInvoice);
	},
);
