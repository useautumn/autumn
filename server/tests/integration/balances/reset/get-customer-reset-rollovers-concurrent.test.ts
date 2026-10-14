import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type CheckResponseV2,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: multiple GETs all return reset balance with rollover")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-get",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
		],
	});

	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(150);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.customers.get<ApiCustomer>(customerId),
		),
	);

	for (const customer of results) {
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(550);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);
		expect(customer.balances[TestFeature.Messages].rollovers).toBeDefined();
		expect(customer.balances[TestFeature.Messages].rollovers!.length).toBe(1);
		expect(customer.balances[TestFeature.Messages].rollovers![0].balance).toBe(
			150,
		);
	}

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
	expect(cusEntAfter!.rollovers.length).toBe(1);
});

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: multiple checks all return reset balance with rollover")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-check",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			}),
		),
	);

	for (const res of results) {
		const check = res as unknown as CheckResponseV2;
		expect(check.allowed).toBe(true);
		expect(check.balance?.current_balance).toBe(700);
		expect(check.balance?.usage).toBe(0);
	}
});

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: multiple tracks reset once then deduct atomically")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-track",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
		],
	});

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
		),
	);

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages].current_balance).toBe(550);
	expect(customer.balances[TestFeature.Messages].usage).toBe(50);
	expect(customer.balances[TestFeature.Messages].rollovers).toBeDefined();
	expect(customer.balances[TestFeature.Messages].rollovers!.length).toBe(1);

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages].current_balance).toBe(550);
	expect(customerDb.balances[TestFeature.Messages].usage).toBe(50);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
	expect(cusEntAfter!.rollovers.length).toBe(1);
});

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: excess rollovers cleared from cache after max cap")}`, async () => {
	const maxRolloverConfig = {
		max: 80,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
		rolloverConfig: maxRolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-max-clear",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
		],
	});

	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(50);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const afterReset1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterReset1.balances[TestFeature.Messages].current_balance).toBe(150);
	expect(afterReset1.balances[TestFeature.Messages].rollovers!.length).toBe(1);
	expect(afterReset1.balances[TestFeature.Messages].rollovers![0].balance).toBe(
		50,
	);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.customers.get<ApiCustomer>(customerId),
		),
	);

	const afterSettle = await autumnV2.customers.get<ApiCustomer>(customerId);
	const msgBalance = afterSettle.balances[TestFeature.Messages];
	expect(msgBalance.current_balance).toBe(180);
	expect(msgBalance.usage).toBe(0);
	expect(msgBalance.rollovers).toBeDefined();
	expect(msgBalance.rollovers!.length).toBe(1);
	expect(msgBalance.rollovers![0].balance).toBe(80);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
	expect(cusEntAfter!.rollovers.length).toBe(1);
	expect(cusEntAfter!.rollovers[0].balance).toBe(80);
});
