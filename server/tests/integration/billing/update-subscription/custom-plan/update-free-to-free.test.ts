import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	EntInterval,
	ProductItemInterval,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

test.concurrent(`${chalk.yellowBright("free-to-free: add boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-add-bool",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	const dashboardItem = items.dashboard();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-free: add unlimited feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-add-unlimited",
		setup: [s.customer({}), s.products({ list: [free] })],
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

	const unlimitedMessagesItem = items.unlimitedMessages();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [unlimitedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features[TestFeature.Messages].unlimited).toBe(true);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-free: add included feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-add-included",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	const wordsItem = items.monthlyWords({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, wordsItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

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

test.concurrent(`${chalk.yellowBright("free-to-free: remove feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const free = products.base({ items: [messagesItem, wordsItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-remove-feat",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

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

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expect(customer.features[TestFeature.Words]).toBeUndefined();

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-free: increase included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-inc-included",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
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

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

test.concurrent(`${chalk.yellowBright("free-to-free: decrease included usage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-dec-included",
		setup: [s.customer({}), s.products({ list: [free] })],
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

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

test.concurrent(`${chalk.yellowBright("free-to-free: change interval month to week")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-int-m2w",
		setup: [s.customer({}), s.products({ list: [free] })],
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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

	expect(customer.features[TestFeature.Messages].interval).toEqual(
		EntInterval.Week,
	);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-free: change interval month to year")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2f-int-m2y",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	const messagesUsage = 45;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

	expect(customer.features[TestFeature.Messages].interval).toEqual(
		EntInterval.Year,
	);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("free-to-free: anchor stays same after 5 days")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "f2f-anchor-5d",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	const messagesUsage = 20;
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
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 5,
	});

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 150 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

	const messagesUsage = 15;
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
	const originalResetAt =
		customerBefore.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 10,
	});

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

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const newResetAt = customer.features[TestFeature.Messages].next_reset_at;
	expect(newResetAt).toBeDefined();

	const originalDay = new Date(originalResetAt!).getDay();
	const newDay = new Date(newResetAt!).getDay();
	expect(newDay).toEqual(originalDay);

	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});
