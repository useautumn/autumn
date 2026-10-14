import { expect, test } from "bun:test";
import type { ApiCustomer, CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-combined1: current_balance + granted_balance together")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-combined1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		included_grant: 100,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
		purchased_balance: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
		included_grant: 150,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 80,
		usage: 70,
		purchased_balance: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 100,
		included_grant: 100,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("update-combined2: current_balance + next_reset_at together")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-combined2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const originalResetAt = initialCheck.balance?.reset?.resets_at ?? 0;
	const cusEntId = initialCheck.balance?.breakdown?.[0]?.id ?? "";

	expect(originalResetAt).toBeGreaterThan(Date.now());
	expect(cusEntId).toBeTruthy();

	const newResetAt1 = Date.now() + 7 * 24 * 60 * 60 * 1000;

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		next_reset_at: newResetAt1,
		customer_entitlement_id: cusEntId,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check1.balance?.reset?.resets_at).toBeCloseTo(newResetAt1, -3);

	const newResetAt2 = Date.now() + 30 * 24 * 60 * 60 * 1000;

	const updateParams = {
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		next_reset_at: newResetAt2,
		customer_entitlement_id: cusEntId,
	};
	await autumnV2.balances.update(updateParams);

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 200,
		usage: -100,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check2.balance?.reset?.resets_at).toBeCloseTo(newResetAt2, -3);

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 200,
		usage: -100,
	});
});

test.concurrent(`${chalk.yellowBright("update-combined3: current_balance + granted_balance + next_reset_at")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-combined3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const cusEntId = initialCheck.balance?.breakdown?.[0]?.id ?? "";

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});

	const newResetAt1 = Date.now() + 14 * 24 * 60 * 60 * 1000;

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
		included_grant: 150,
		next_reset_at: newResetAt1,
		customer_entitlement_id: cusEntId,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 80,
		usage: 70,
		purchased_balance: 0,
	});

	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check1.balance?.reset?.resets_at).toBeCloseTo(newResetAt1, -3);

	const newResetAt2 = Date.now() + 30 * 24 * 60 * 60 * 1000;

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		included_grant: 200,
		next_reset_at: newResetAt2,
		customer_entitlement_id: cusEntId,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
		purchased_balance: 0,
	});

	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check2.balance?.reset?.resets_at).toBeCloseTo(newResetAt2, -3);

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
	});
});
