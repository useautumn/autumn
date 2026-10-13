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
