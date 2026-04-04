/**
 * Sync Scenarios
 *
 * Sets up customers with Stripe subscriptions ready for manual sync testing.
 * Each scenario stops after Stripe subscription creation — no sync is executed.
 *
 * A: Pro subscription on empty customer
 * B: Pro subscription on customer with Free (expire previous)
 * C: Pro + add-on in a single Stripe subscription
 * D: Two separate Stripe subscriptions
 * E: Subscription created then test clock advanced 2 weeks
 * F: Trialing Stripe subscription (14-day trial, advanced 3 days)
 * G: Ad-hoc inline Stripe price (no Autumn match)
 */

import { test } from "bun:test";
import {
	createStripeSubscriptionFromProduct,
	createStripeSubscriptionFromProducts,
	getAllStripePriceIds,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

// ═══════════════════════════════════════════════════════════════════════════════
// A: Pro subscription on empty customer
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: pro on empty customer")}`, async () => {
	const customerId = "sync-sc-empty";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// B: Pro subscription on customer with Free
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: pro on customer with free")}`, async () => {
	const customerId = "sync-sc-free-to-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		group: "main",
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
		group: "main",
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// C: Pro + add-on in a single Stripe subscription
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: pro + add-on single sub")}`, async () => {
	const customerId = "sync-sc-pro-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [usersItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	await createStripeSubscriptionFromProducts({
		ctx,
		customerId,
		productIds: [pro.id, addon.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// D: Two separate Stripe subscriptions
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: two separate subscriptions")}`, async () => {
	const customerId = "sync-sc-two-subs";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
		group: "main",
	});

	const usersItem = items.monthlyUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [usersItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	await Promise.all([
		createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		}),
		createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: premium.id,
		}),
	]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// E: Subscription + test clock advanced 2 weeks
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: clock advanced 2 weeks")}`, async () => {
	const customerId = "sync-sc-clock";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 2,
		waitForSeconds: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// F: Trialing Stripe subscription (14-day trial, advanced 3 days)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: trialing subscription")}`, async () => {
	const customerId = "sync-sc-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripePriceIds = getAllStripePriceIds({ fullProduct });

	const trialParams: Stripe.SubscriptionCreateParams = {
		customer: fullCustomer.processor!.id!,
		items: stripePriceIds.map((priceId) => ({ price: priceId })),
		trial_period_days: 14,
	};
	await ctx.stripeCli.subscriptions.create(trialParams);

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
		waitForSeconds: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// G: Ad-hoc inline Stripe price (no Autumn match)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sync-scenario: ad-hoc inline price")}`, async () => {
	const customerId = "sync-sc-adhoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const adHocProduct = await ctx.stripeCli.products.create({
		name: "Ad-Hoc Service",
	});
	const adHocParams: Stripe.SubscriptionCreateParams = {
		customer: fullCustomer.processor!.id!,
		items: [
			{
				price_data: {
					currency: "usd",
					unit_amount: 4999,
					recurring: { interval: "month" },
					product: adHocProduct.id,
				},
			},
		],
	};
	await ctx.stripeCli.subscriptions.create(adHocParams);
});
