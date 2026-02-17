import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("v2-customize update: both customize.price + customize.items")}`, async () => {
	const customerId = "v2-update-customize-both";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		product_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
			items: [itemsV2.monthlyWords({ included: 200 })],
		},
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(10);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 10,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize update: only customize.price")}`, async () => {
	const customerId = "v2-update-customize-only-price";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		product_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 24 }),
		},
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(4);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 4,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize update: only customize.items")}`, async () => {
	const customerId = "v2-update-customize-only-items";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		product_id: pro.id,
		customize: {
			price: null,
			items: [itemsV2.monthlyMessages({ included: 180 })],
		},
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(-20);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 180,
		balance: 180,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: -20,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize update: plan item v1 prepaid mapping")}`, async () => {
	const customerId = "v2-update-customize-prepaid-map";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		customize: {
			price: null,
			items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 })],
		},
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(-10);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: -10,
	});
});

test.concurrent(`${chalk.yellowBright("v2-customize update: plan item v1 multi-feature mapping")}`, async () => {
	const customerId = "v2-update-customize-multi-feature-map";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		product_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 40 }),
			items: [
				itemsV2.monthlyMessages({ included: 300 }),
				itemsV2.monthlyWords({ included: 150 }),
			],
		},
	};

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 150,
		balance: 150,
		usage: 0,
	});
});
