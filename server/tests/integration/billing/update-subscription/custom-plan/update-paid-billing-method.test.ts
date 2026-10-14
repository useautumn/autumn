import { expect, test } from "bun:test";
import { type ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("p2p: consumable to prepaid with overage")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-cons-to-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesUsage = 80;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toBe(-30);

	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [prepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	};
	3;
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

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

test.concurrent(`${chalk.yellowBright("p2p: prepaid to consumable")}`, async () => {
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [prepaidItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-prepaid-to-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const messagesUsage = 40;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

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

test.concurrent(`${chalk.yellowBright("p2p: included to consumable with overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-inc-to-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesUsage = 60;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

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

test.concurrent(`${chalk.yellowBright("p2p: consumable to included (remove overage)")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-cons-to-inc",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const messagesUsage = 35;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

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

test.concurrent(`${chalk.yellowBright("p2p: allocated to prepaid")}`, async () => {
	const allocatedItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [allocatedItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-alloc-to-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const usersUsage = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsage,
		},
		{ timeout: 2000 },
	);

	const prepaidItem = items.prepaidUsers({ includedUsage: 0 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [prepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Users, quantity: 10 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 10 - usersUsage,
		usage: usersUsage,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("p2p: prepaid to allocated")}`, async () => {
	const prepaidItem = items.prepaidUsers({ includedUsage: 0 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [prepaidItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-prepaid-to-alloc",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Users, quantity: 10 }],
			}),
		],
	});

	const usersUsage = 6;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsage,
		},
		{ timeout: 2000 },
	);

	const allocatedItem = items.allocatedUsers({ includedUsage: 3 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [allocatedItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedItem.included_usage,
		balance: allocatedItem.included_usage - usersUsage,
		usage: usersUsage,
	});

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

test.concurrent(`${chalk.yellowBright("p2p: allocated with entity-based usage")}`, async () => {
	const allocatedItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [allocatedItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-alloc-entities",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedItem.included_usage,
		balance: allocatedItem.included_usage - 3,
		usage: 3,
	});

	const newAllocatedItem = items.allocatedUsers({ includedUsage: 5 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	await autumnV1.subscriptions.update(updateParams);

	const updatedCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: updatedCustomer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedItem.included_usage,
		balance: newAllocatedItem.included_usage - 3,
		usage: 3,
	});

	await expectCustomerInvoiceCorrect({
		customer: updatedCustomer,
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
