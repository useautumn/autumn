import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	EntInterval,
	ProductItemInterval,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: INCLUDED USAGE SHIFTS
// ═══════════════════════════════════════════════════════════════════════════════

// 4.8 Shift included usage up (50 -> 200)
test.concurrent(`${chalk.yellowBright("p2p: shift included usage up")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-shift-inc-up",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track usage that puts us in overage (80 used, 50 included = 30 overage)
	const messagesUsage = 80;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Shift included up to 200 - should cover existing usage
	const newConsumableItem = items.consumableMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newConsumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change, just included usage shift
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, now within included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newConsumableItem.included_usage,
		balance: newConsumableItem.included_usage - messagesUsage, // 200 - 80 = 120
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
});

// 4.9 Shift included usage down (200 -> 50) into overage
test.concurrent(`${chalk.yellowBright("p2p: shift included usage down into overage")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 200 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-shift-inc-down",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track usage within included (80 used, 200 included)
	const messagesUsage = 80;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Shift included down to 50 - puts existing usage into overage
	const newConsumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newConsumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change, just included usage shift (consumable overage not charged on update)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, now in overage (80 used, 50 included = 30 overage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newConsumableItem.included_usage,
		balance: newConsumableItem.included_usage - messagesUsage, // 50 - 80 = -30
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: OVERAGE BILLING MID-CYCLE
// ═══════════════════════════════════════════════════════════════════════════════

// 5.1 Mid-cycle update with pending overage
test.concurrent(`${chalk.yellowBright("p2p: mid-cycle update with pending overage")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-pending-overage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track usage that goes over included (50 included, use 80 = 30 overage @ $0.10 = $3)
	const messagesUsage = 80;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Update to different consumable config
	const newConsumableItem = items.consumableMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newConsumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Preview should NOT include overage charge (consumable overage not charged on update)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, now within included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newConsumableItem.included_usage,
		balance: newConsumableItem.included_usage - messagesUsage,
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
});

// 5.2 Update consumable to more included covers overage
test.concurrent(`${chalk.yellowBright("p2p: update to more included covers overage")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-cover-overage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track usage that goes over (80 used with 50 included = 30 overage)
	const messagesUsage = 80;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify customer is over their limit
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toBeLessThan(0);

	// Update to 100 included - should now cover the usage
	const newConsumableItem = items.consumableMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newConsumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change (consumable overage not charged on update)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Now usage is within included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newConsumableItem.included_usage,
		balance: newConsumableItem.included_usage - messagesUsage, // 100 - 80 = 20
		usage: messagesUsage,
	});

	// Balance should now be positive
	expect(customer.features[TestFeature.Messages].balance).toBeGreaterThan(0);

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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: INTERVAL CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// 6.1 Monthly to annual
test.concurrent(`${chalk.yellowBright("p2p: monthly to annual")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, monthlyPriceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-month-to-annual",
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

	// Change to annual pricing
	const annualPriceItem = items.annualPrice({ price: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, annualPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $180 ($200 annual - $20 monthly credit)
	expect(preview.total).toBe(180);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should be preserved
	expectCustomerFeatureCorrect({
		customer,
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
});

// 6.2 Annual to monthly
test.concurrent(`${chalk.yellowBright("p2p: annual to monthly")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const annualPriceItem = items.annualPrice({ price: 200 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, annualPriceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-annual-to-month",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Change to monthly pricing
	const monthlyPriceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, monthlyPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit $180 ($20 monthly - $200 annual credit)
	expect(preview.total).toBe(-180);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should be preserved
	expectCustomerFeatureCorrect({
		customer,
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
});

// 6.3 Change feature reset interval (month to week)
test.concurrent(`${chalk.yellowBright("p2p: change feature reset interval")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-reset-interval",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 40;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Change to weekly reset
	const weeklyMessagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Week,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [weeklyMessagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change, just interval change
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should stay
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

	// Verify interval changed
	expect(customer.features[TestFeature.Messages].interval).toEqual(
		EntInterval.Week,
	);

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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: TIME-ADVANCED UPDATES (TEST CLOCK)
// ═══════════════════════════════════════════════════════════════════════════════

// 7.4 Reset cycle anchor preserved after 5 days
test.concurrent(`${chalk.yellowBright("p2p: reset anchor preserved after 5 days")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "p2p-anchor-5d",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 25;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Get the original reset time
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Advance test clock by 5 days
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 5,
	});

	// Update with more included usage (keep same price)
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 150 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change, just included usage change
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should stay the same, reset anchor should stay approximately the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
		resetsAt: originalResetAt!,
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: COMBINATION UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

// 9.3 Change interval + add feature + change usage
test.concurrent(`${chalk.yellowBright("p2p: interval + feature + usage change")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, monthlyPriceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-combo-complex",
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

	// Complex update: monthly -> annual + add words + increase messages to 200
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const annualPriceItem = items.annualPrice({ price: 200 });
	const wordsItem = items.monthlyWords({ includedUsage: 500 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem, annualPriceItem, wordsItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $180 ($200 annual - $20 monthly credit)
	expect(preview.total).toBe(180);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages usage preserved, higher limit
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Words added
	expectCustomerFeatureCorrect({
		customer,
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
});
