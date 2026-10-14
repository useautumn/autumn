import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update with prepaid but missing options defaults quantity to 0")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-prepaid-no-opts",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		price: 10,
		billingUnits: 100,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("add prepaid feature without options defaults its quantity to 0")}`, async () => {
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		price: 10,
		billingUnits: 100,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		items: [priceItem, prepaidMessagesItem],
		id: "pro",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-add-prepaid-no-opts",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	const prepaidWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		price: 15,
		billingUnits: 100,
		includedUsage: 0,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [priceItem, prepaidMessagesItem, prepaidWordsItem],
		options: [
			{ feature_id: TestFeature.Messages, quantity: 5 },
		],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("error: negative quantity for prepaid feature")}`, async () => {
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		price: 10,
		billingUnits: 100,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		items: [priceItem, prepaidMessagesItem],
		id: "pro-neg",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-negative-qty",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro-neg",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [priceItem, prepaidMessagesItem],
		options: [
			{ feature_id: TestFeature.Messages, quantity: -1 },
		],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: update quantity for non-existent feature")}`, async () => {
	const product = products.base({
		id: "multi_feature",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
		],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-nonexistent-feature",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 10 * 10 }],
			}),
		],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: product.id,
				options: [{ feature_id: TestFeature.Users, quantity: 10 * 10 }],
			});
		},
	});
});
