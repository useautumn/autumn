import { expect, test } from "bun:test";
import { ProductItemInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-FREE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Adding a boolean feature to existing free product (usage should stay)
test.concurrent(`${chalk.yellowBright("free-to-free: add boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-add-bool",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	// Add boolean dashboard feature
	const dashboardItem = items.dashboard();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for free-to-free
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages usage should stay the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Dashboard should be accessible (boolean feature)
	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	// No invoice for free-to-free
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 2. Adding unlimited feature to existing free product (usage should stay)
test.concurrent(`${chalk.yellowBright("free-to-free: add unlimited feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-add-unlimited",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage before update
	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Replace messages with unlimited
	const unlimitedMessagesItem = items.unlimitedMessages();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [unlimitedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages should now be unlimited
	expect(customer.features[TestFeature.Messages].unlimited).toBe(true);

	// No invoice for free-to-free
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 3. Adding additional included feature (usage should stay for existing)
test.concurrent(`${chalk.yellowBright("free-to-free: add included feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-add-included",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	// Add words feature
	const wordsItem = items.monthlyWords({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, wordsItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages usage should stay the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Words should have full balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 4. Removing a feature (usage for remaining should stay)
test.concurrent(`${chalk.yellowBright("free-to-free: remove feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const free = products.base({ items: [messagesItem, wordsItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-remove-feat",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Track usage on both features
	const messagesUsage = 25;
	const wordsUsage = 75;
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

	// Remove words feature, keep only messages
	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages usage should stay the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Words should no longer exist
	expect(customer.features[TestFeature.Words]).toBeUndefined();

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 5. Update included usage on existing feature (increase)
test.concurrent(`${chalk.yellowBright("free-to-free: increase included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-inc-included",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage
	const messagesUsage = 60;
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
		product_id: free.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Usage should stay, balance should increase
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 6. Update included usage on existing feature (decrease)
test.concurrent(`${chalk.yellowBright("free-to-free: decrease included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-dec-included",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	// Decrease included usage from 200 to 100
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Usage should stay, balance should decrease
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 7. Update interval on existing feature (month -> week)
test.concurrent(`${chalk.yellowBright("free-to-free: change interval month to week")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-int-m2w",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	// Change interval from monthly to weekly
	const weeklyMessagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Week,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [weeklyMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

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
		ProductItemInterval.Week,
	);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 8. Update interval on existing feature (month -> year)
test.concurrent(`${chalk.yellowBright("free-to-free: change interval month to year")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-int-m2y",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	// Change interval from monthly to yearly
	const yearlyMessagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Year,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [yearlyMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

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
		ProductItemInterval.Year,
	);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-FREE: RESET CYCLE ANCHOR PRESERVATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// 9. Reset cycle anchor stays same after advancing clock 5 days
test.concurrent(`${chalk.yellowBright("free-to-free: anchor stays same after 5 days")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "f2f-anchor-5d",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage
	const messagesUsage = 20;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Get the original reset time
	const customerBefore = await autumnV1.customers.get(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Advance test clock by 5 days
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 5,
	});

	// Update with slightly more included usage
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 150 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for free-to-free
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Usage should stay the same, reset anchor should stay approximately the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
		resetsAt: originalResetAt!,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 11. Reset cycle anchor stays same after advancing clock 2 weeks (weekly feature)
test.concurrent(`${chalk.yellowBright("free-to-free: weekly anchor stays same after 2 weeks")}`, async () => {
	const weeklyMessagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		interval: ProductItemInterval.Week,
	});
	const free = products.base({ items: [weeklyMessagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "f2f-anchor-2w",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage
	const messagesUsage = 15;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Get the original reset time
	const customerBefore = await autumnV1.customers.get(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Advance test clock by 10 days (note: this will trigger resets)
	// We're testing that after update, the anchor day remains the same
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 10,
	});

	// Update with more included usage
	const updatedWeeklyMessagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Week,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [updatedWeeklyMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for free-to-free
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// After 2 weeks, balance would have reset, but anchor day should be preserved
	// The next_reset_at should be aligned to the same day of week as original
	const newResetAt = customer.features[TestFeature.Messages].next_reset_at;
	expect(newResetAt).toBeDefined();

	// Calculate day of week from both timestamps (should be same day)
	const originalDay = new Date(originalResetAt!).getDay();
	const newDay = new Date(newResetAt!).getDay();
	expect(newDay).toEqual(originalDay);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});
