/**
 * Regression coverage for the invoice.paid → convert-to-charge-automatically
 * task when the subscription carries invoice-only payment method settings
 * (org `allowed_payment_methods`, Settings → Invoices).
 *
 * Contract under test:
 *   - Once the customer pays the sent invoice with a card, the subscription
 *     flips to charge_automatically with that card as its default payment
 *     method.
 *   - The invoice-only `payment_settings.payment_method_types` is cleared in
 *     the same update — Stripe rejects the flip outright while
 *     `customer_balance` is listed, which previously left every such
 *     subscription stuck on send_invoice.
 *
 * The payment method list is set directly on the Stripe subscription rather
 * than via org config: `allowed_payment_methods` produces exactly this
 * subscription state, but mutating the shared test org's config would race
 * concurrent tests, and platform sub-orgs (which allow config overrides)
 * don't receive Stripe Connect webhook deliveries in test environments. The
 * org-config gate (convert_to_charge_automatically: false) is unit-tested in
 * tests/unit/stripe/convert-to-charge-automatically.test.ts for the same
 * reason.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

/** `customer_balance` is what Stripe rejects on charge_automatically subs, so
 *  include it whenever the account has bank transfers activated; a bare
 *  ["card"] still verifies the list gets cleared. */
const resolveInvoicePaymentMethods = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Promise<string[]> => {
	try {
		const configurations = await stripeCli.paymentMethodConfigurations.list({
			limit: 10,
		});
		const defaultConfiguration =
			configurations.data.find((configuration) => configuration.is_default) ??
			configurations.data[0];
		return defaultConfiguration?.customer_balance?.available === true
			? ["card", "customer_balance"]
			: ["card"];
	} catch {
		return ["card"];
	}
};

test.concurrent(
	`${chalk.yellowBright("invoice convert: paid invoice flips the sub to charge_automatically and clears invoice payment methods")}`,
	async () => {
		const customerId = "invoice-convert-charge-auto";
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
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
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

		// Reproduce what attaching under org `allowed_payment_methods` creates.
		const paymentMethodTypes = await resolveInvoicePaymentMethods({
			stripeCli: ctx.stripeCli,
		});
		await ctx.stripeCli.subscriptions.update(subscription.id, {
			payment_settings: {
				payment_method_types:
					paymentMethodTypes as Stripe.SubscriptionUpdateParams.PaymentSettings.PaymentMethodType[],
			},
		});

		await payOpenInvoice({ ctx, customerId });

		const converted = await pollUntil({
			fetch: () => ctx.stripeCli.subscriptions.retrieve(subscription.id),
			until: (sub) => sub.collection_method === "charge_automatically",
			timeoutMs: 90_000,
		});

		expect(converted.collection_method).toBe("charge_automatically");
		expect(converted.default_payment_method).toBeTruthy();
		// The invoice-only payment method list must be unset by the conversion.
		expect(converted.payment_settings?.payment_method_types).toBeNull();
	},
);
