import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@shared/index";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("version-billing: add prepaid users")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Users]).toBeUndefined();

	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 5 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem, prepaidUsersItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		options: [{ feature_id: TestFeature.Users, quantity: 0 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 5,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-billing: add consumable overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-consumable",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	await autumnV1.products.update(pro.id, {
		items: [consumableMessagesItem, priceItem],
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

	expect(customer.features[TestFeature.Messages]).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-billing: add allocated seats")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-allocated",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem, allocatedUsersItem],
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
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-billing: metered to prepaid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-to-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
			}),
		],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();

	const prepaidMessagesItem = items.prepaidMessages({ includedUsage: 0 });
	await autumnV1.products.update(pro.id, {
		items: [prepaidMessagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	};

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-billing: mixed billing models")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-mixed",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 3 });
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const newPriceItem = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [consumableMessagesItem, prepaidUsersItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
		options: [{ feature_id: TestFeature.Users, quantity: 0 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features[TestFeature.Messages]).toBeDefined();

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-billing: remove prepaid keep metered")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 5 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, prepaidUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-remove",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Users, quantity: 0 }],
			}),
		],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Users]).toBeDefined();

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
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expect(customer.features[TestFeature.Users]).toBeUndefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
