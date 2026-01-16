import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@shared/index";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION ENTITLEMENTS: Feature/entitlement changes between versions
// ═══════════════════════════════════════════════════════════════════════════════

// 2.1 Remove boolean feature: v2 removes dashboard access
test.concurrent(`${chalk.yellowBright("version-entitlements: remove boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const dashboardItem = items.dashboard();
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem, dashboardItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-ent-remove-bool",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify dashboard accessible before update
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();

	// Create v2 without dashboard feature
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Boolean feature removal has no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages should have full balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Dashboard should no longer be accessible
	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2.2 Swap features: v1 has messages, v2 has words (completely different feature)
test.concurrent(`${chalk.yellowBright("version-entitlements: swap features")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-ent-swap",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify messages accessible, words not
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();
	expect(customerBefore.features[TestFeature.Words]).toBeUndefined();

	// Create v2 with words instead of messages
	const wordsItem = items.monthlyWords({ includedUsage: 500 });
	await autumnV1.products.update(pro.id, {
		items: [wordsItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Feature swap has no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages should no longer be accessible
	expect(customer.features[TestFeature.Messages]).toBeUndefined();

	// Words should now be accessible with full balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2.3 Multiple feature changes: v2 adds 2 features, removes 1
test.concurrent(`${chalk.yellowBright("version-entitlements: multiple feature changes")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const dashboardItem = items.dashboard();
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, dashboardItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-ent-multi-change",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify initial state: messages + dashboard
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();
	expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();
	expect(customerBefore.features[TestFeature.Words]).toBeUndefined();
	expect(customerBefore.features[TestFeature.Credits]).toBeUndefined();

	// Create v2: remove dashboard, add words + credits
	const wordsItem = items.monthlyWords({ includedUsage: 500 });
	const creditsItem = items.monthlyCredits({ includedUsage: 1000 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, wordsItem, creditsItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Feature changes have no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages should still be there
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Dashboard should be removed
	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	// Words should be added
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});

	// Credits should be added
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Credits,
		includedUsage: creditsItem.included_usage,
		balance: creditsItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2.4 Feature type change: limited → unlimited for same feature
test.concurrent(`${chalk.yellowBright("version-entitlements: limited to unlimited")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-ent-to-unlimited",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify messages is limited before update
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]?.unlimited).toBeFalsy();

	// Create v2 with unlimited messages
	const unlimitedMessagesItem = items.unlimitedMessages();
	await autumnV1.products.update(pro.id, {
		items: [unlimitedMessagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Unlimited change has no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages should be unlimited
	const messagesFeature = customer.features[TestFeature.Messages];
	expect(messagesFeature).toBeDefined();
	expect(messagesFeature?.unlimited).toBe(true);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2.5 Entitlements + price change combined: v2 has more features AND higher price
test.concurrent(`${chalk.yellowBright("version-entitlements: features and price increase")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-ent-plus-price",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with more features AND higher price ($30)
	const newPriceItem = items.monthlyPrice({ price: 30 });
	const dashboardItem = items.dashboard();
	const wordsItem = items.monthlyWords({ includedUsage: 500 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, dashboardItem, wordsItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 difference ($30 - $20)
	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages should have full balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Dashboard should be accessible
	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	// Words should be accessible
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});

	// Verify invoice matches preview
	await expectCustomerInvoiceCorrect({
		customerId,
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

// 2.6 Entitlements + price decrease combined: v2 has fewer features AND lower price
test.concurrent(`${chalk.yellowBright("version-entitlements: features and price decrease")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const dashboardItem = items.dashboard();
	const wordsItem = items.monthlyWords({ includedUsage: 500 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, dashboardItem, wordsItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-ent-minus-price",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify initial state has all features
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();
	expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();
	expect(customerBefore.features[TestFeature.Words]).toBeDefined();

	// Create v2 with fewer features AND lower price ($20)
	const newPriceItem = items.monthlyPrice({ price: 20 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit $10 difference ($20 - $30)
	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages should have full balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Dashboard should be removed
	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	// Words should be removed
	expect(customer.features[TestFeature.Words]).toBeUndefined();

	// Verify invoice matches preview
	await expectCustomerInvoiceCorrect({
		customerId,
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
