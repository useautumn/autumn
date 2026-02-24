import { expect, test } from "bun:test";

import type {
	ApiCustomer,
	ApiCustomerV3,
	TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════
// TRACK-NEGATIVE1: Testing negative values (refunds/credits) on metered feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-negative1: negative values for refunds/credits")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-negative1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	const customerAfterDeduct =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterDeduct.features[TestFeature.Messages]).toMatchObject({
		balance: 70,
		usage: 30,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: -10,
	});

	const customerAfterRefund =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterRefund.features[TestFeature.Messages]).toMatchObject({
		balance: 80,
		usage: 20,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expect(customerNonCached.features[TestFeature.Messages]).toMatchObject({
		balance: 80,
		usage: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: -50,
	});

	const customerAfterLargeRefund =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterLargeRefund.features[TestFeature.Messages]).toMatchObject(
		{
			balance: 100,
			usage: 0,
		},
	);

	await timeout(8000);

	const customerLargeRefundNonCached =
		await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
	expect(
		customerLargeRefundNonCached.features[TestFeature.Messages],
	).toMatchObject({
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-NEGATIVE2: Negative on metered feature (deduct then refund)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-negative2: negative on metered feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-negative2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	const deductValue = -37.89;
	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deductValue,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		purchased_balance: 0,
		usage: 0,
	});

	const deductValue1 = 50;
	const deductValue2 = -37.89;
	const expectedUsage = new Decimal(deductValue1).add(deductValue2).toNumber();
	const expectedBalance = new Decimal(100).sub(expectedUsage).toNumber();

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deductValue1,
	});
	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deductValue2,
	});

	expect(trackRes2.balance).toMatchObject({
		granted_balance: 100,
		current_balance: expectedBalance,
		purchased_balance: 0,
		usage: expectedUsage,
	});

	await timeout(2000);
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: expectedBalance,
		purchased_balance: 0,
		usage: expectedUsage,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-NEGATIVE3: Negative on allocated feature (reduces purchased_balance first, then granted)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-negative3: negative on allocated feature (purchased_balance first)")}`, async () => {
	const usersItem = items.freeUsers({ includedUsage: 5 });
	const freeProd = products.base({
		id: "free",
		items: [usersItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-negative3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Users].balance).toEqual(5);

	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	expect(trackRes1.balance).toBeDefined();
	expect(trackRes1.balance).toMatchObject({
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -2,
	});

	expect(trackRes2.balance).toMatchObject({
		current_balance: 0,
		purchased_balance: 1,
		usage: 6,
	});

	const trackRes3: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -2,
	});

	expect(trackRes3.balance).toMatchObject({
		current_balance: 1,
		purchased_balance: 0,
		usage: 4,
	});

	await timeout(2000);
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});

	expect(customer.balances[TestFeature.Users]).toMatchObject({
		current_balance: 1,
		purchased_balance: 0,
		usage: 4,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-NEGATIVE4: Negative caps at granted_balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-negative4: negative caps at granted_balance")}`, async () => {
	const usersItem = items.freeUsers({ includedUsage: 5 });
	const freeProd = products.base({
		id: "free",
		items: [usersItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "track-negative4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	expect(trackRes1.balance).toBeDefined();
	expect(trackRes1.balance).toMatchObject({
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -20,
	});

	expect(trackRes2.balance).toMatchObject({
		granted_balance: 5,
		current_balance: 5,
		purchased_balance: 0,
		usage: 0,
	});

	await timeout(2000);
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});

	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 5,
		purchased_balance: 0,
		usage: 0,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		current_balance: 10,
		granted_balance: 10,
	});

	const customerUpdated = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerUpdated.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 10,
		current_balance: 10,
		purchased_balance: 0,
		usage: 0,
	});

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});
	const trackRes3: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: -100,
	});

	expect(trackRes3.balance).toMatchObject({
		granted_balance: 10,
		current_balance: 10,
		purchased_balance: 0,
		usage: 0,
	});
});
