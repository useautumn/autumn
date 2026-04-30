/**
 * TDD test for `automatic_tax` on recurring subscriptions (Cycles 3 + 4).
 *
 * Exercises BOTH attach paths concurrently:
 *  - v1 legacy `/v1/attach` via `s.attach(...)` → createStripeSub2
 *  - v2 `/v1/billing.attach` via `s.billing.attach(...)` → executeStripeSubscriptionOperation
 *
 * Red-failure mode (current behavior, pre-fix):
 *  - Both paths' `subscriptions.create` calls omit `automatic_tax: { enabled: true }`.
 *  - Result: subscription.automatic_tax.enabled is false, latest invoice
 *    total stays at the pre-tax base amount.
 *
 * Green-success criteria (after fix):
 *  - Both paths pass `automatic_tax: { enabled: true }` when org config is on.
 *  - Subscription.automatic_tax.enabled === true on both.
 *  - Latest invoice total = base price + 10% AU GST.
 *
 * Pro product is auto-priced at $20/mo by `constructProduct`. Expected total
 * with AU GST: $22.00 = 2200 cents.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

async function assertSubscriptionTaxed({
	ctx,
	stripeCusId,
}: {
	ctx: TestContext;
	stripeCusId: string;
}) {
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(subs.data.length).toBeGreaterThan(0);
	const sub = subs.data[0];
	expect(sub.automatic_tax.enabled).toBe(true);

	const latestInvoiceId =
		typeof sub.latest_invoice === "string"
			? sub.latest_invoice
			: (sub.latest_invoice as Stripe.Invoice).id!;
	const invoice = await ctx.stripeCli.invoices.retrieve(latestInvoiceId);
	expect(invoice.total).toBe(2200);
	expect(invoice.subtotal).toBe(2000);
	expect(invoice.total - invoice.subtotal).toBe(200);
}

test.concurrent(
	`${chalk.yellowBright("automatic-tax-subscription (v1 legacy /v1/attach): pro $20/mo + AU GST = $22 on first invoice")}`,
	async () => {
		const customerId = "tax-sub-v1";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		await assertSubscriptionTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
		});
	},
	240_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-subscription (v2 /v1/billing.attach): pro $20/mo + AU GST = $22 on first invoice")}`,
	async () => {
		const customerId = "tax-sub-v2";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		await assertSubscriptionTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
		});
	},
	240_000,
);
