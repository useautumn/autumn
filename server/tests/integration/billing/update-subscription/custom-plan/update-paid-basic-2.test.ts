// SLICE 2 of 3 of the paid-to-paid custom-plan basic updates.

import { expect, test } from "bun:test";
import { type ApiCustomerV3, applyProration } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: BOOLEAN FEATURE ADD/REMOVE
// ═══════════════════════════════════════════════════════════════════════════════

// 1.1 Add boolean feature to paid plan
test.concurrent(
	`${chalk.yellowBright("p2p: add boolean feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-add-bool",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 35;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Get original reset time
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages].next_reset_at;
		expect(originalResetAt).toBeDefined();

		// Add boolean dashboard feature
		const dashboardItem = items.dashboard();

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem, dashboardItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Boolean features have no price impact
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
			resetsAt: originalResetAt!,
		});

		// Dashboard should be accessible (boolean feature)
		expect(customer.features[TestFeature.Dashboard]).toBeDefined();

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

// 1.2 Remove boolean feature from paid plan
test.concurrent(
	`${chalk.yellowBright("p2p: remove boolean feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const dashboardItem = items.dashboard();
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem, dashboardItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-remove-bool",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 60;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Get original reset time
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages].next_reset_at;

		// Verify dashboard is accessible before
		expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();

		// Remove dashboard feature
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Boolean features have no price impact
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
			resetsAt: originalResetAt!,
		});

		// Dashboard should no longer be accessible
		expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

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

// 1.3 Add second metered feature
test.concurrent(
	`${chalk.yellowBright("p2p: add second metered feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-add-metered",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 45;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Add words feature
		const wordsItem = items.monthlyWords({ includedUsage: 200 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem, wordsItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Adding included feature has no price impact
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

		// Words should have full balance
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: wordsItem.included_usage,
			balance: wordsItem.included_usage,
			usage: 0,
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

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: INCLUDED USAGE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// 2.1 Increase included usage (100 -> 200)
test.concurrent(
	`${chalk.yellowBright("p2p: increase included usage")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-inc-usage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 70;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Increase included usage from 100 to 200
		const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [updatedMessagesItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Included usage change has no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay, balance should increase
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: updatedMessagesItem.included_usage,
			balance: updatedMessagesItem.included_usage - messagesUsage,
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

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: TIME-ADVANCED PRICE CHANGES (TEST CLOCK)
// ═══════════════════════════════════════════════════════════════════════════════

// 7.2 Mid-cycle (15 days) price decrease
test.concurrent(
	`${chalk.yellowBright("p2p: mid-cycle price decrease")}`,
	async () => {
		const oldPrice = 30;
		const newPrice = 20;
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: oldPrice });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx, testClockId } = await initScenario({
			customerId: "p2p-midcycle-dec",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 45;
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

		// Decrease price from $30 to $20
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
