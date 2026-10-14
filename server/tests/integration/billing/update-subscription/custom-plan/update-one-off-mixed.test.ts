import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("mixed: free product → recurring product with one-off prepaid item")}`, async () => {
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProduct = products.base({
		items: [freeMessagesItem],
		id: "free",
		isDefault: true,
	});
	const customerId = "free-to-recurring-with-oneoff";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProduct], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	const monthlyBasePrice = items.monthlyPrice({ price: 20 });
	const dashboardItem = items.dashboard();
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 200;

	const updateParams = {
		customer_id: customerId,
		product_id: freeProduct.id,
		items: [monthlyBasePrice, dashboardItem, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	const expectedTotal = 20 + (quantity / 100) * 10;
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("mixed: recurring product → same product + one-off prepaid item")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });

	const proProduct = products.base({
		items: [dashboardItem, monthlyBasePrice],
		id: "pro",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "recurring-add-oneoff",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [s.attach({ productId: proProduct.id, timeout: 4000 })],
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 300;

	const updateParams = {
		customer_id: customerId,
		product_id: proProduct.id,
		items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	const expectedCharge = (quantity / 100) * 10;
	expect(preview.total).toBe(expectedCharge);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("mixed: recurring + one-off mid-cycle (no proration on one-off)")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });

	const proProduct = products.base({
		items: [dashboardItem, monthlyBasePrice],
		id: "pro",
	});

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "recurring-oneoff-midcycle",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [s.attach({ productId: proProduct.id })],
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 300;

	const updateParams = {
		customer_id: customerId,
		product_id: proProduct.id,
		items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	const expectedCharge = (quantity / 100) * 10;
	expect(preview.total).toBe(expectedCharge);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("mixed: recurring with one-off → updated recurring retaining one-off")}`, async () => {
	const dashboardItem = items.dashboard();
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proProduct = products.pro({
		items: [dashboardItem, oneOffMessagesItem],
		id: "pro-v1",
	});

	const initialQuantity = 200;

	const { customerId, autumnV1 } = await initScenario({
		customerId: "recurring-with-oneoff-update",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [
			s.attach({
				productId: proProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	const messagesUsed = 100;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	const monthlyBasePrice = items.monthlyPrice({ price: 30 });
	const wordsItem = items.monthlyWords({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: proProduct.id,
		items: [monthlyBasePrice, dashboardItem, wordsItem, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity: initialQuantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	const oneOffCharge = (initialQuantity / 100) * 10;
	const basePriceDiff = 30 - 20;
	const expectedTotal = oneOffCharge + basePriceDiff;
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: initialQuantity + (initialQuantity - messagesUsed),
		balance: initialQuantity + (initialQuantity - messagesUsed),
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("mixed: free → trial product with one-off prepaid item")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const freeProduct = products.base({
		id: "free-starter",
		items: [dashboardItem],
		isDefault: false,
	});

	const quantity = 200;

	const { customerId, autumnV1 } = await initScenario({
		customerId: "free-to-trial-oneoff",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeProduct] }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: freeProduct.id,
		items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: false,
			card_required: true,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	const oneOffCharge = (quantity / 100) * 10;
	expect(preview.total).toBe(oneOffCharge);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});
