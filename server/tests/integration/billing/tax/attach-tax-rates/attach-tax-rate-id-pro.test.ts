/**
 * Pass an explicit Stripe tax rate ID (`tax_rate_id`) through
 * `/v1/billing.attach` and assert that:
 *   - The created Stripe subscription carries it in `default_tax_rates`.
 *   - The first invoice applies the 10% rate on top of pro's $20 base.
 */

import { expect, test } from "bun:test";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

const subTaxRateIds = (sub: Stripe.Subscription): string[] =>
	(sub.default_tax_rates ?? []).map((rate) =>
		typeof rate === "string" ? rate : rate.id,
	);

test.concurrent(
	`${chalk.yellowBright("attach-tax-rate-id (v2 /v1/billing.attach): pro $20/mo + explicit 10% tax_rate_id = $22 invoice")}`,
	async () => {
		const customerId = "attach-tax-rate-pro";
		const proProd = products.pro({ id: "pro", items: [] });

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Test Tax",
			percentage: 10,
			inclusive: false,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: proProd.id,
			tax_rate_id: taxRate.id,
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		expect(subTaxRateIds(subscription)).toContain(taxRate.id);

		const latestInvoiceId =
			typeof subscription.latest_invoice === "string"
				? subscription.latest_invoice
				: (subscription.latest_invoice as Stripe.Invoice).id!;
		const invoice = await stripeCli.invoices.retrieve(latestInvoiceId);

		expect(invoice.subtotal).toBe(2000);
		expect(invoice.total).toBe(2200);
		expect(invoice.total - invoice.subtotal).toBe(200);
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-tax-rate-id (v2): tax_rate_id set on pro persists through upgrade to premium")}`,
	async () => {
		const customerId = "attach-tax-rate-pro-then-premium";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Test Tax",
			percentage: 10,
			inclusive: false,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: proProd.id,
			tax_rate_id: taxRate.id,
		});

		const afterAttach = await getStripeSubscription({ customerId });
		expect(subTaxRateIds(afterAttach.subscription)).toContain(taxRate.id);

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premiumProd.id,
		});

		const afterUpgrade = await getStripeSubscription({ customerId });
		expect(subTaxRateIds(afterUpgrade.subscription)).toContain(taxRate.id);
	},
);
