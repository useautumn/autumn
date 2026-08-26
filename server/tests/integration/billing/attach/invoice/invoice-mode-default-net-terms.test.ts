/**
 * Regression coverage for org-level `default_net_terms_days` on invoice-mode
 * attaches.
 *
 * Contract under test:
 *   - `org.config.default_net_terms_days` is applied as `days_until_due` on
 *     invoice-mode (send_invoice) subscription creation.
 *   - It is also applied to the standalone invoice a one-off attach creates.
 *   - Unset config keeps the historical 30-day due window, so existing orgs
 *     see no behavior change.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const ORG_DEFAULT_NET_TERMS_DAYS = 45;
const HARDCODED_NET_TERMS_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

// ═══════════════════════════════════════════════════════════════════
// TEST 1: org default lands on the invoice-mode subscription
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode net terms: subscription uses the org default")}`,
	async () => {
		const customerId = "invoice-net-terms-subscription";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: {
						default_net_terms_days: ORG_DEFAULT_NET_TERMS_DAYS,
					},
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
			],
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer?.processor?.id ?? "",
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.days_until_due).toBe(ORG_DEFAULT_NET_TERMS_DAYS);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: org default lands on a one-off attach's standalone invoice
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode net terms: one-off invoice uses the org default")}`,
	async () => {
		const customerId = "invoice-net-terms-one-off";
		const oneOff = products.oneOff({
			id: "one-off-credits",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: {
						default_net_terms_days: ORG_DEFAULT_NET_TERMS_DAYS,
					},
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [oneOff] }),
			],
			actions: [
				s.billing.attach({
					productId: oneOff.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: false,
				}),
			],
		});

		const invoices = await ctx.stripeCli.invoices.list({
			customer: customer?.processor?.id ?? "",
			limit: 1,
		});
		const invoice = invoices.data[0];

		expect(invoice).toBeDefined();
		expect(invoice.collection_method).toBe("send_invoice");
		// Stripe resolves days_until_due into an absolute due_date at creation.
		expect(invoice.due_date).not.toBeNull();
		const dueInDays = Math.round(
			((invoice.due_date ?? 0) - invoice.created) / SECONDS_PER_DAY,
		);
		expect(dueInDays).toBe(ORG_DEFAULT_NET_TERMS_DAYS);
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 3: unset org config keeps the 30-day due window
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode net terms: unset org config keeps 30 days")}`,
	async () => {
		const customerId = "invoice-net-terms-unset";
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
			customer: customer?.processor?.id ?? "",
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.days_until_due).toBe(HARDCODED_NET_TERMS_DAYS);
	},
);
