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

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();

	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

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

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();
	expect(customerBefore.features[TestFeature.Words]).toBeUndefined();

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

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features[TestFeature.Messages]).toBeUndefined();

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

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();
	expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();
	expect(customerBefore.features[TestFeature.Words]).toBeUndefined();
	expect(customerBefore.features[TestFeature.Credits]).toBeUndefined();

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

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});

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

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]?.unlimited).toBeFalsy();

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

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

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

	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});

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

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();
	expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();
	expect(customerBefore.features[TestFeature.Words]).toBeDefined();

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

	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	expect(customer.features[TestFeature.Words]).toBeUndefined();

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
