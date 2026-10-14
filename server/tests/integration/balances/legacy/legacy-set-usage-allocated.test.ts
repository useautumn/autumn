import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-set-usage-free-alloc1: set usage within included on free allocated")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "legacy-set-usage-free-alloc1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Users]).toMatchObject({
		balance: 2,
		usage: 3,
		included_usage: 5,
	});

	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.features[TestFeature.Users]).toMatchObject({
		balance: 2,
		usage: 3,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-set-usage-free-alloc2: set usage beyond included on free allocated")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "legacy-set-usage-free-alloc2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Users]).toMatchObject({
		balance: -3,
		usage: 8,
		included_usage: 5,
	});

	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.features[TestFeature.Users]).toMatchObject({
		balance: -3,
		usage: 8,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-set-usage-prepaid1: set usage with prepaid balance")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const prepaidItem = items.prepaidMessages({
		price: 10,
		billingUnits: 100,
	});
	const prepaidAddOn = products.oneOffAddOn({
		id: "prepaid-msgs",
		items: [prepaidItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "legacy-set-usage-prepaid1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidAddOn] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.billing.attach({
				productId: prepaidAddOn.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	await autumnV1.usage({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Messages]).toMatchObject({
		balance: 150,
		usage: 100,
	});

	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.features[TestFeature.Messages]).toMatchObject({
		balance: 150,
		usage: 100,
	});
});
