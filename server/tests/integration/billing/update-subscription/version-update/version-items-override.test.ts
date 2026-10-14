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

test.concurrent(`${chalk.yellowBright("version-items: override version price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-items-price",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	const customPriceItem = items.monthlyPrice({ price: 50 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		items: [messagesItem, customPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(30);

	await autumnV1.subscriptions.update(updateParams);

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

test.concurrent(`${chalk.yellowBright("version-items: override included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-items-usage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesItemV2 = items.monthlyMessages({ includedUsage: 200 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItemV2, priceItem],
	});

	const customMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		items: [customMessagesItem, priceItem],
	};

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-items: add extra feature via items")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-items-add-feat",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	const dashboardItem = items.dashboard();
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		items: [messagesItem, priceItemV2, dashboardItem],
	};

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-items: override price and usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-items-both",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesItemV2 = items.monthlyMessages({ includedUsage: 200 });
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItemV2, priceItemV2],
	});

	const customMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const customPriceItem = items.monthlyPrice({ price: 50 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		items: [customMessagesItem, customPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(30);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
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

test.concurrent(`${chalk.yellowBright("version-items: partial override keeps version items")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 500 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, wordsItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-items-partial",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesItemV2 = items.monthlyMessages({ includedUsage: 200 });
	const wordsItemV2 = items.monthlyWords({ includedUsage: 1000 });
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItemV2, wordsItemV2, priceItemV2],
	});

	const customMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		items: [customMessagesItem, wordsItemV2, priceItemV2],
	};

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-items: items override lower price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-items-lower",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const priceItemV2 = items.monthlyPrice({ price: 50 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	const customPriceItem = items.monthlyPrice({ price: 25 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		items: [messagesItem, customPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(5);

	await autumnV1.subscriptions.update(updateParams);

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
