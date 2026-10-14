import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateProrationFromPeriod } from "@tests/integration/billing/utils/proration/calculateProration";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-add-base",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
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

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base + consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyBasePrice = 20;
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "f2p-add-base-cons",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [
			s.attach({ productId: "base" }),
			s.advanceTestClock({ weeks: 2 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice({ price: monthlyBasePrice });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	const expectedPreviewTotal = calculateProrationFromPeriod({
		billingPeriod: {
			start: advancedTo,
			end: addMonths(advancedTo, 1).getTime(),
		},
		advancedTo,
		amount: monthlyBasePrice,
	});

	expect(preview.total).toEqual(expectedPreviewTotal);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});
	expect(customer.features[TestFeature.Messages].next_reset_at).not.toEqual(
		originalResetAt,
	);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedPreviewTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-paid: add annual base + monthly consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-add-annual-cons",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const priceItem = items.annualPrice();
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(200);

	await autumnV1.subscriptions.update(updateParams, { timeout: 2000 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-update-to-cons",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
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

test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to prepaid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-update-to-prepaid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const prepaidItem = items.prepaidMessages();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidItem],
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-paid: update free users to allocated")}`, async () => {
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const free = products.base({ items: [usersItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-free-to-allocated",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const usersUsed = 3;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsed,
		},
		{ timeout: 2000 },
	);

	const initialCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(initialCustomer.features[TestFeature.Users].balance).toEqual(
		usersItem.included_usage - usersUsed,
	);

	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [allocatedUsersItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedUsersItem.included_usage,
		balance: allocatedUsersItem.included_usage - usersUsed,
		usage: usersUsed,
	});

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

test.concurrent(`${chalk.yellowBright("free-to-paid: convert to unlimited with monthly price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-unlimited-price",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();

	const updateParams1 = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	};

	const preview1 = await autumnV1.subscriptions.previewUpdate(updateParams1);

	expect(preview1.total).toEqual(20);

	await autumnV1.subscriptions.update(updateParams1);

	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customer1,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expectCustomerInvoiceCorrect({
		customer: customer1,
		count: 1,
		latestTotal: 20,
	});

	const unlimitedMessagesItem = items.unlimitedMessages();

	const updateParams2 = {
		customer_id: customerId,
		product_id: free.id,
		items: [unlimitedMessagesItem, priceItem],
	};

	const preview2 = await autumnV1.subscriptions.previewUpdate(updateParams2);

	expect(preview2.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams2);

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer2.features[TestFeature.Messages].unlimited).toBe(true);

	expectCustomerInvoiceCorrect({
		customer: customer2,
		count: 2,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
