/**
 * Coverage for `org.config.convert_to_charge_automatically` on invoice-mode
 * subscriptions (Settings → Invoices "Convert to automatic charging").
 *
 * Contract under test:
 *   - Flag on (default): once the customer pays the sent invoice with a card,
 *     the subscription flips to charge_automatically with that card as its
 *     default payment method, and the invoice-only
 *     `payment_settings.payment_method_types` (from `allowed_payment_methods`)
 *     is cleared — Stripe rejects the flip while `customer_balance` is set.
 *   - Flag off: the paid invoice is processed normally but the subscription
 *     stays on send_invoice.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

const attachedProductIds = (customer: {
	products?: { id: string; status?: string }[];
}) => (customer.products ?? []).map((product) => product.id);

const latestSubscription = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<Stripe.Subscription> => {
	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		limit: 1,
	});
	const subscription = subscriptions.data[0];
	expect(subscription).toBeDefined();
	return subscription;
};

// ═══════════════════════════════════════════════════════════════════
// TEST 1: flag on — paying the invoice converts the subscription
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice convert: paid invoice flips the sub to charge_automatically")}`,
	async () => {
		const customerId = "invoice-convert-on";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					// card is universally activated; the conversion previously failed
					// outright when this list included customer_balance.
					configOverrides: { allowed_payment_methods: ["card"] },
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					finalizeInvoice: true,
				}),
			],
		});

		const stripeCustomerId = customer!.processor!.id!;
		const before = await latestSubscription({
			stripeCli: ctx.stripeCli,
			stripeCustomerId,
		});
		expect(before.collection_method).toBe("send_invoice");
		expect(before.payment_settings?.payment_method_types).toEqual(["card"]);

		await payOpenInvoice({ ctx, customerId });

		const converted = await pollUntil({
			fetch: () =>
				latestSubscription({ stripeCli: ctx.stripeCli, stripeCustomerId }),
			until: (sub) => sub.collection_method === "charge_automatically",
			timeoutMs: 90_000,
		});

		expect(converted.collection_method).toBe("charge_automatically");
		expect(converted.default_payment_method).toBeTruthy();
		// The invoice-only payment method list must be unset by the conversion.
		expect(converted.payment_settings?.payment_method_types).toBeNull();

		// The paid invoice also attached the product (webhook processed fully).
		const finalCustomer = await autumnV1.customers.get(customerId);
		expect(attachedProductIds(finalCustomer)).toContain(pro.id);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: flag off — the paid invoice leaves the sub on send_invoice
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice convert: disabled org config keeps the sub on send_invoice")}`,
	async () => {
		const customerId = "invoice-convert-off";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { convert_to_charge_automatically: false },
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					finalizeInvoice: true,
				}),
			],
		});

		const stripeCustomerId = customer!.processor!.id!;
		await payOpenInvoice({ ctx, customerId });

		// The product attaching proves the invoice.paid webhook was processed —
		// so an unconverted sub below is the config gate, not missing delivery.
		await pollUntil({
			fetch: () => autumnV1.customers.get(customerId),
			until: (fetched) => attachedProductIds(fetched).includes(pro.id),
			timeoutMs: 90_000,
		});

		const subscription = await latestSubscription({
			stripeCli: ctx.stripeCli,
			stripeCustomerId,
		});
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.default_payment_method).toBeNull();
	},
);
