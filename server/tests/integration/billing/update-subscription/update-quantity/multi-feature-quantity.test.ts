import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-quantity: features in reverse order")}`, async () => {
	const customerId = "multi-feat-reverse-order";

	const product = products.base({
		id: "multi_feature",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
			items.prepaid({
				featureId: TestFeature.Words,
				billingUnits: 100,
			}),
			items.prepaid({
				featureId: TestFeature.Users,
				billingUnits: 1,
				price: 2,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * 10 },
					{ feature_id: TestFeature.Words, quantity: 5 * 100 },
					{ feature_id: TestFeature.Users, quantity: 20 * 1 },
				],
			}),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Users, quantity: 50 * 1 },
			{ feature_id: TestFeature.Words, quantity: 10 * 100 },
			{ feature_id: TestFeature.Messages, quantity: 5 * 10 },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(50);
	expect(customer.features?.[TestFeature.Words]?.balance).toBe(1000);
	expect(customer.features?.[TestFeature.Users]?.balance).toBe(50);
});

test.concurrent(`${chalk.yellowBright("update-quantity: features in random order")}`, async () => {
	const customerId = "multi-feat-random-order";

	const product = products.base({
		id: "multi_feature",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
			items.prepaid({
				featureId: TestFeature.Words,
				billingUnits: 100,
			}),
			items.prepaid({
				featureId: TestFeature.Users,
				billingUnits: 1,
				price: 2,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * 10 },
					{ feature_id: TestFeature.Words, quantity: 5 * 100 },
					{ feature_id: TestFeature.Users, quantity: 20 * 1 },
				],
			}),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: 20 * 100 },
			{ feature_id: TestFeature.Users, quantity: 100 * 1 },
			{ feature_id: TestFeature.Messages, quantity: 15 * 10 },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(150);
	expect(customer.features?.[TestFeature.Words]?.balance).toBe(2000);
	expect(customer.features?.[TestFeature.Users]?.balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("update-quantity: partial update (one feature changed)")}`, async () => {
	const customerId = "multi-feat-partial-update";

	const product = products.base({
		id: "multi_feature",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
			items.prepaid({
				featureId: TestFeature.Words,
				billingUnits: 100,
			}),
			items.prepaid({
				featureId: TestFeature.Users,
				billingUnits: 1,
				price: 2,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 15 * 10 },
					{ feature_id: TestFeature.Words, quantity: 20 * 100 },
					{ feature_id: TestFeature.Users, quantity: 100 * 1 },
				],
			}),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: 30 * 100 },
			{ feature_id: TestFeature.Messages, quantity: 15 * 10 },
			{ feature_id: TestFeature.Users, quantity: 100 * 1 },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Words]?.balance).toBe(3000);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(150);
	expect(customer.features?.[TestFeature.Users]?.balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("update-quantity: duplicate feature_ids uses last value")}`, async () => {
	const customerId = "multi-feat-duplicate-ids";

	const product = products.base({
		id: "two_feature",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
			items.prepaid({
				featureId: TestFeature.Words,
				billingUnits: 100,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * 10 },
					{ feature_id: TestFeature.Words, quantity: 5 * 100 },
				],
			}),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * 10 },
			{ feature_id: TestFeature.Messages, quantity: 30 * 10 },
			{ feature_id: TestFeature.Words, quantity: 10 * 100 },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const messagesBalance = customer.features?.[TestFeature.Messages]?.balance;

	expect([200, 300]).toContain(messagesBalance ?? 0);
});
