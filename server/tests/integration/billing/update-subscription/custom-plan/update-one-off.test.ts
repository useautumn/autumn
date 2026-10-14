import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

test.concurrent(`${chalk.yellowBright("one-off: update included usage on free messages")}`, async () => {
	const oldIncludedUsage = 100;
	const messagesItem = items.monthlyMessages({
		includedUsage: oldIncludedUsage,
	});
	const oneOffProduct = products.oneOff({
		items: [messagesItem],
		id: "one-off-free",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-update-included",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [s.attach({ productId: oneOffProduct.id, timeout: 3000 })],
	});

	const messagesUsed = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	const newIncludedUsage = 200;
	const updatedMessagesItem = items.monthlyMessages({
		includedUsage: newIncludedUsage,
	});

	const oneOffPriceItem = constructPriceItem({ price: 10, interval: null });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [updatedMessagesItem, oneOffPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newIncludedUsage,
		balance: newIncludedUsage - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});
});

test.concurrent(`${chalk.yellowBright("one-off: add boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const oneOffProduct = products.oneOff({
		items: [messagesItem],
		id: "one-off-no-dashboard",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-add-boolean",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [s.attach({ productId: oneOffProduct.id })],
	});

	const dashboardItem = items.dashboard();
	const oneOffPriceItem = constructPriceItem({ price: 10, interval: null });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [messagesItem, dashboardItem, oneOffPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});
});

test.concurrent(`${chalk.yellowBright("one-off: remove boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const dashboardItem = items.dashboard();
	const oneOffProduct = products.oneOff({
		items: [messagesItem, dashboardItem],
		id: "one-off-with-dashboard",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-remove-boolean",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [s.attach({ productId: oneOffProduct.id })],
	});

	const oneOffPriceItem = constructPriceItem({ price: 10, interval: null });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [messagesItem, oneOffPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});
});

