/**
 * Regression coverage for org-level `allowed_payment_methods` on invoice-mode
 * subscriptions (PRD: "Choose payment methods on Autumn invoices").
 *
 * Contract under test:
 *   - `org.config.allowed_payment_methods` is applied as
 *     `payment_settings.payment_method_types` on invoice-mode (send_invoice)
 *     subscription creation.
 *   - The next-cycle (renewal/overage) invoice inherits the list from the
 *     subscription — usage tracked at $0.01/unit lands as a $10 cycle invoice
 *     offering the configured methods, bank transfer included.
 *   - Unset config sends no payment_method_types, so Stripe's own account
 *     invoice settings keep applying (no behavior change for existing orgs).
 */

import { expect, test } from "bun:test";
import type { InvoicePaymentMethod } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

const ALLOWED_PAYMENT_METHODS: InvoicePaymentMethod[] = [
	"card",
	"customer_balance",
	"us_bank_account",
	"link",
];

const sorted = (values: string[] | null | undefined) =>
	[...(values ?? [])].sort();

const findCycleInvoice = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<Stripe.Invoice | undefined> => {
	for (let attempt = 0; attempt < 5; attempt++) {
		const invoices = await stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 10,
		});
		const cycleInvoice = invoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (cycleInvoice) return cycleInvoice;
		await timeout(10000);
	}
	return undefined;
};

// ═══════════════════════════════════════════════════════════════════
// TEST 1: configured methods reach the sub and its next-cycle invoice
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: cycle invoice inherits the org's allowed list")}`,
	async () => {
		const customerId = "invoice-payment-methods-cycle";
		const usageItem = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.01,
			billingUnits: 1,
		});
		const usagePlan = products.base({
			id: "usage-plan",
			items: [usageItem],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { allowed_payment_methods: ALLOWED_PAYMENT_METHODS },
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: true }),
				s.products({ list: [usagePlan] }),
			],
			actions: [
				s.billing.attach({
					productId: usagePlan.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 1000,
					timeout: 3000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const stripeCustomerId = customer!.processor!.id!;
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(sorted(subscription.payment_settings?.payment_method_types)).toEqual(
			sorted(ALLOWED_PAYMENT_METHODS),
		);

		const cycleInvoice = await findCycleInvoice({
			stripeCli: ctx.stripeCli,
			stripeCustomerId,
		});

		expect(cycleInvoice).toBeDefined();
		// 1000 tracked units × $0.01 = $10.00
		expect(cycleInvoice!.total).toBe(1000);
		expect(
			sorted(cycleInvoice!.payment_settings?.payment_method_types),
		).toEqual(sorted(ALLOWED_PAYMENT_METHODS));
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: unset config leaves Stripe's own invoice settings in charge
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: unset org config sends no payment_method_types")}`,
	async () => {
		const customerId = "invoice-payment-methods-unset";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					finalizeInvoice: true,
				}),
			],
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer!.processor!.id!,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.payment_settings?.payment_method_types).toBeNull();
	},
);
