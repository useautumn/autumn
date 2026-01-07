import { expect, test } from "bun:test";
import { ProductItemInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-FREE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Adding a boolean feature to existing free product (usage should stay)
test.concurrent(`${chalk.yellowBright("free-to-free: add boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-add-bool",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem],
	});

	// No charge for free-to-free
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem],
	});

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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Adding unlimited feature to existing free product (usage should stay)
test.concurrent(`${chalk.yellowBright("free-to-free: add unlimited feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-add-unlimited",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [unlimitedMessagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [unlimitedMessagesItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	// Messages should now be unlimited
	expect(customer.features[TestFeature.Messages].unlimited).toBe(true);

	// No invoice for free-to-free
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Adding additional included feature (usage should stay for existing)
test.concurrent(`${chalk.yellowBright("free-to-free: add included feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-add-included",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, wordsItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, wordsItem],
	});

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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Removing a feature (usage for remaining should stay)
test.concurrent(`${chalk.yellowBright("free-to-free: remove feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const free = products.base({ items: [messagesItem, wordsItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-remove-feat",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem],
	});

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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. Update included usage on existing feature (increase)
test.concurrent(`${chalk.yellowBright("free-to-free: increase included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-inc-included",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6. Update included usage on existing feature (decrease)
test.concurrent(`${chalk.yellowBright("free-to-free: decrease included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-dec-included",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 7. Update interval on existing feature (month -> week)
test.concurrent(`${chalk.yellowBright("free-to-free: change interval month to week")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-int-m2w",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [weeklyMessagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [weeklyMessagesItem],
	});

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
	expect(customer.features[TestFeature.Messages].interval).toEqual("week");

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 8. Update interval on existing feature (month -> year)
test.concurrent(`${chalk.yellowBright("free-to-free: change interval month to year")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2f-int-m2y",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [yearlyMessagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [yearlyMessagesItem],
	});

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
	expect(customer.features[TestFeature.Messages].interval).toEqual("year");

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-FREE: RESET CYCLE ANCHOR PRESERVATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// 9. Reset cycle anchor stays same after advancing clock 5 days
test.concurrent(`${chalk.yellowBright("free-to-free: anchor stays same after 5 days")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initTestScenario({
		customerId: "f2f-anchor-5d",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	// Usage should stay the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Reset anchor should stay approximately the same (within 1 hour)
	const newResetAt = customer.features[TestFeature.Messages].next_reset_at;
	expect(newResetAt).toBeDefined();
	expect(Math.abs(newResetAt! - originalResetAt!)).toBeLessThanOrEqual(3600000); // 1 hour tolerance

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// 10. Reset cycle anchor stays same after advancing clock 15 days (half month)
test.concurrent(`${chalk.yellowBright("free-to-free: anchor stays same after 15 days")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initTestScenario({
		customerId: "f2f-anchor-15d",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	// Get the original reset time
	const customerBefore = await autumnV1.customers.get(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Advance test clock by 15 days
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

	// Add a new feature while updating
	const wordsItem = items.monthlyWords({ includedUsage: 200 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, wordsItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	// Messages usage should stay the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Reset anchor for messages should stay approximately the same
	const newResetAt = customer.features[TestFeature.Messages].next_reset_at;
	expect(newResetAt).toBeDefined();
	expect(Math.abs(newResetAt! - originalResetAt!)).toBeLessThanOrEqual(3600000); // 1 hour tolerance

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

	const { customerId, autumnV1, ctx, testClockId } = await initTestScenario({
		customerId: "f2f-anchor-2w",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
		},
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

	// Advance test clock by 2 weeks (note: this will trigger resets)
	// We're testing that after update, the anchor day remains the same
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 2,
	});

	// Update with more included usage
	const updatedWeeklyMessagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Week,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedWeeklyMessagesItem],
	});

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

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-PAID TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Adding a monthly base price to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2p-add-base",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();

	// Preview should show $20 charge
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - 100,
		usage: 100,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Adding monthly base price + consumable to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base + consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2p-add-base-cons",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	// Track some usage before update
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Adding annual base price + monthly consumable to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add annual base + monthly consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2p-add-annual-cons",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	const priceItem = items.annualPrice();
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	});

	expect(preview.total).toEqual(200);

	await autumnV1.subscriptions.update(
		{
			customer_id: customerId,
			product_id: free.id,
			items: [consumableItem, priceItem],
		},
		{ timeout: 2000 },
	);

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 200,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Updating free feature item to consumable
test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2p-update-to-cons",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	// Track some usage first
	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Update to consumable (pay-per-use after included usage)
	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem],
	});

	// No immediate charge - consumable bills in arrears
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// No invoice - consumable bills in arrears, no immediate charge
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. Updating free feature item to prepaid
test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to prepaid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2p-update-to-prepaid",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	// Track some usage first
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Update to prepaid (purchase units upfront)
	const prepaidItem = items.prepaidMessages();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidItem],
	});

	// No immediate charge for switching to prepaid model
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidItem],
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 100,
			},
		],
	});

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

	// Prepaid charges upfront - $10 for 100 units
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6. Updating free users to allocated users
test.concurrent(`${chalk.yellowBright("free-to-paid: update free users to allocated")}`, async () => {
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const free = products.base({ items: [usersItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "f2p-free-to-allocated",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	// Use some users (continuous use feature)
	const usersUsed = 3;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsed,
		},
		{ timeout: 2000 },
	);

	// Verify initial state
	const initialCustomer = await autumnV1.customers.get(customerId);
	expect(initialCustomer.features[TestFeature.Users].balance).toEqual(
		usersItem.included_usage - usersUsed,
	);

	// Update to allocated users ($10/seat prorated billing)
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [allocatedUsersItem],
	});

	// Should charge for (usersUsed - includedUsage) extra seats = (3 - 2) = 1 seat @ $10
	expect(preview.total).toEqual(10);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [allocatedUsersItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedUsersItem.included_usage,
		balance: allocatedUsersItem.included_usage - usersUsed,
		usage: usersUsed,
	});

	// Invoice for the extra seat
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
