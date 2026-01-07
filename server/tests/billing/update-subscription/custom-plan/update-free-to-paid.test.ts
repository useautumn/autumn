import { expect, test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";
import chalk from "chalk";

// 1. Adding a monthly base price to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initTestScenario({
		customerId: "free-to-paid-monthly-base",
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
});

// 2. Adding monthly base price + consumable to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base + consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initTestScenario({
		customerId: "free-to-paid-monthly-consumable",
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
});

// 3. Adding annual base price + monthly consumable to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add annual base + monthly consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initTestScenario({
		customerId: "free-to-paid-annual-consumable",
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

	const { customerId, autumnV1 } = await initTestScenario({
		customerId: "free-to-paid-to-consumable",
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
});

// 5. Updating free feature item to prepaid
test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to prepaid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initTestScenario({
		customerId: "free-to-paid-to-prepaid",
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
});
