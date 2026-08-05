// SLICE 1 of 3 of the paid-to-paid custom-plan basic updates.

import { expect, test } from "bun:test";
import { type ApiCustomerV3, applyProration } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectSubCount,
	expectSubToBeCorrect,
} from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: BASE PRICE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// 3.1 Increase base price ($20 -> $30)
test.concurrent(
	`${chalk.yellowBright("p2p: increase base price")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-inc-price",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 40;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Increase price from $20 to $30
		const newPriceItem = items.monthlyPrice({ price: 30 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should charge $10 difference ($30 - $20)
		expect(preview.total).toBe(10);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Verify invoice matches preview
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2, // Initial attach + upgrade
			latestTotal: preview.total,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// 3.2 Decrease base price ($30 -> $20)
test.concurrent(
	`${chalk.yellowBright("p2p: decrease base price")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 30 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-dec-price",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 25;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Decrease price from $30 to $20
		const newPriceItem = items.monthlyPrice({ price: 20 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should credit $10 difference ($20 - $30)
		expect(preview.total).toBe(-10);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Verify invoice matches preview
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// 3.3 Remove base price (paid to free)
test.concurrent(
	`${chalk.yellowBright("p2p: remove base price (to free)")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-remove-price",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 50;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Remove price, keep only messages
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should credit full $20 (refund for unused portion)
		expect(preview.total).toBe(-20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Now free, should have no Stripe subscription
		await expectSubCount({
			ctx,
			customerId,
			count: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: BOOLEAN FEATURE ADD/REMOVE
// ═══════════════════════════════════════════════════════════════════════════════

// 1.4 Remove one metered feature
test.concurrent(
	`${chalk.yellowBright("p2p: remove one metered feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, wordsItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-remove-metered",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track usage on both features
		const messagesUsage = 30;
		const wordsUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Words,
				value: wordsUsage,
			},
			{ timeout: 2000 },
		);
		return;

		// Remove words feature
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Removing included feature has no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Words should no longer exist
		expect(customer.features[TestFeature.Words]).toBeUndefined();

		// Verify invoice matches preview
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: TIME-ADVANCED PRICE CHANGES (TEST CLOCK)
// ═══════════════════════════════════════════════════════════════════════════════

// 7.1 Mid-cycle (15 days) price increase
test.concurrent(
	`${chalk.yellowBright("p2p: mid-cycle price increase")}`,
	async () => {
		const oldPrice = 20;
		const newPrice = 30;
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: oldPrice });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx, testClockId } = await initScenario({
			customerId: "p2p-midcycle-inc",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 55;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Advance 15 days (mid-cycle)
		const advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 15,
		});

		// Use floored seconds to match Stripe's frozen_time calculation
		const frozenTimeMs = Math.floor(advancedTo / 1000) * 1000;

		// Get billing period from customer's subscription
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const subscription = customerBefore.products?.[0];
		if (
			!subscription?.current_period_start ||
			!subscription?.current_period_end
		)
			throw new Error("Missing billing period on subscription");

		const billingPeriod = {
			start: subscription.current_period_start,
			end: subscription.current_period_end,
		};

		// Increase price from $20 to $30
		const newPriceItem = items.monthlyPrice({ price: newPrice });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Calculate exact proration: credit old price + charge new price
		const proratedOldPrice = applyProration({
			now: frozenTimeMs,
			billingPeriod,
			amount: oldPrice,
		});
		const proratedNewPrice = applyProration({
			now: frozenTimeMs,
			billingPeriod,
			amount: newPrice,
		});
		const expectedAmount = proratedNewPrice - proratedOldPrice;

		expect(preview.total).toBeCloseTo(expectedAmount, 0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Verify invoice matches preview
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
