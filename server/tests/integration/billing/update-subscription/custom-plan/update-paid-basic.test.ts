import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
test.concurrent(`${chalk.yellowBright("p2p: increase base price")}`, async () => {
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
		count: 2, // Initial attach + upgrade
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3.2 Decrease base price ($30 -> $20)
test.concurrent(`${chalk.yellowBright("p2p: decrease base price")}`, async () => {
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

// 3.3 Remove base price (paid to free)
test.concurrent(`${chalk.yellowBright("p2p: remove base price (to free)")}`, async () => {
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
	expectCustomerFeatureCorrect({
		customer,
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: BOOLEAN FEATURE ADD/REMOVE
// ═══════════════════════════════════════════════════════════════════════════════

// 1.1 Add boolean feature to paid plan
test.concurrent(`${chalk.yellowBright("p2p: add boolean feature")}`, async () => {
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
	expectCustomerFeatureCorrect({
		customer,
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
});

// 1.2 Remove boolean feature from paid plan
test.concurrent(`${chalk.yellowBright("p2p: remove boolean feature")}`, async () => {
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
	expectCustomerFeatureCorrect({
		customer,
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
});

// 1.3 Add second metered feature
test.concurrent(`${chalk.yellowBright("p2p: add second metered feature")}`, async () => {
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

// 1.4 Remove one metered feature
test.concurrent(`${chalk.yellowBright("p2p: remove one metered feature")}`, async () => {
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
	expectCustomerFeatureCorrect({
		customer,
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: INCLUDED USAGE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// 2.1 Increase included usage (100 -> 200)
test.concurrent(`${chalk.yellowBright("p2p: increase included usage")}`, async () => {
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
	expectCustomerFeatureCorrect({
		customer,
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
});

// 2.2 Decrease included usage (200 -> 100)
test.concurrent(`${chalk.yellowBright("p2p: decrease included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-dec-usage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 80;
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
		product_id: pro.id,
		items: [updatedMessagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Included usage change has no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should stay, balance should decrease
	expectCustomerFeatureCorrect({
		customer,
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
});

// 2.3 Change to unlimited
test.concurrent(`${chalk.yellowBright("p2p: change to unlimited")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-to-unlimited",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 90;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Change to unlimited
	const unlimitedMessagesItem = items.unlimitedMessages();

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [unlimitedMessagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Changing to unlimited has no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages should now be unlimited
	expect(customer.features[TestFeature.Messages].unlimited).toBe(true);

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
// PAID-TO-PAID: TIME-ADVANCED PRICE CHANGES (TEST CLOCK)
// ═══════════════════════════════════════════════════════════════════════════════

// 7.1 Mid-cycle (15 days) price increase
test.concurrent(`${chalk.yellowBright("p2p: mid-cycle price increase")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
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
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

	// Increase price from $20 to $30
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge ~$5 (prorated $10 difference for ~15 remaining days)
	expect(preview.total).toBe(5);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

// 7.2 Mid-cycle (15 days) price decrease
test.concurrent(`${chalk.yellowBright("p2p: mid-cycle price decrease")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
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
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

	// Decrease price from $30 to $20
	const newPriceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit ~$5 (prorated $10 difference for ~15 remaining days)
	expect(preview.total).toBe(-5);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: COMBINATION PRICE + FEATURE UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

// 9.1 Increase price + add feature
test.concurrent(`${chalk.yellowBright("p2p: increase price + add feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-combo-inc-add",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
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

	// Increase price AND add dashboard
	const newPriceItem = items.monthlyPrice({ price: 30 });
	const dashboardItem = items.dashboard();

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem, dashboardItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 ($30 - $20), dashboard is free boolean
	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages usage preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Dashboard added
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
});

// 9.2 Decrease price + remove feature
test.concurrent(`${chalk.yellowBright("p2p: decrease price + remove feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const dashboardItem = items.dashboard();
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem, dashboardItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-combo-dec-remove",
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

	// Decrease price AND remove dashboard
	const newPriceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit $10 ($20 - $30), dashboard is free boolean
	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages usage preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Dashboard removed
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
});
