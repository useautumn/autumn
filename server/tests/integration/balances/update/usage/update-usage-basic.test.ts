import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-usage1: set usage on fresh product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 30,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
		purchased_balance: 0,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
		purchased_balance: 0,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage2: set usage after tracking (decimals)")}`, async () => {
	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [creditsItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.track({ featureId: TestFeature.Credits, value: 40.5 }),
		],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		usage: 27.35,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Credits].granted_balance).toBe(100);
	expect(customer.balances[TestFeature.Credits].current_balance).toBeCloseTo(
		72.65,
		2,
	);
	expect(customer.balances[TestFeature.Credits].usage).toBeCloseTo(27.35, 2);
	expect(customer.balances[TestFeature.Credits].purchased_balance).toBe(0);

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Credits].current_balance).toBeCloseTo(
		72.65,
		2,
	);
	expect(customerDb.balances[TestFeature.Credits].usage).toBeCloseTo(27.35, 2);
});

test.concurrent(`${chalk.yellowBright("update-usage3: set usage to 0 (reset)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.track({ featureId: TestFeature.Messages, value: 50 }),
		],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 0,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage4: lifetime (one-off) balance")}`, async () => {
	const messagesItem = items.lifetimeMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages].reset?.interval).toBe(
		ResetInterval.OneOff,
	);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 40,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 60,
		usage: 40,
		purchased_balance: 0,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 60,
		usage: 40,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage5: usage greater than granted (overage)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 130,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		purchased_balance: 30,
		usage: 130,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		purchased_balance: 30,
		usage: 130,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage6: negative usage (credit/bonus)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage6",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: -20,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
	});
});
