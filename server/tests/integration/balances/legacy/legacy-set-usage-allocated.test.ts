import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// =============================================================================
// Legacy /usage endpoint tests for free allocated and prepaid allocated features
// =============================================================================

// Test: Set usage on free allocated feature (within included)
test.concurrent(`${chalk.yellowBright("legacy-set-usage-free-alloc1: set usage within included on free allocated")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "legacy-set-usage-free-alloc1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to 3 via legacy /usage endpoint: balance = 5 - 3 = 2
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

	// Verify non-cached
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.features[TestFeature.Users]).toMatchObject({
		balance: 2,
		usage: 3,
	});
});

// Test: Set usage beyond included on free allocated (overage)
test.concurrent(`${chalk.yellowBright("legacy-set-usage-free-alloc2: set usage beyond included on free allocated")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "legacy-set-usage-free-alloc2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to 8 via legacy /usage endpoint: balance = 5 - 8 = -3
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

	// Verify non-cached
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.features[TestFeature.Users]).toMatchObject({
		balance: -3,
		usage: 8,
	});
});

// Test: Set usage with prepaid balance via legacy /usage endpoint
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

	// Initial: granted=50, prepaid=200 (2*100), balance=250
	// Set usage to 100 via legacy /usage: balance = 250 - 100 = 150
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

	// Verify non-cached
	const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.features[TestFeature.Messages]).toMatchObject({
		balance: 150,
		usage: 100,
	});
});
