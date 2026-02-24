import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════
// TRACK-BASIC1: Track with no value provided (defaults to 1)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-basic1: track with no value provided defaults to 1")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-basic1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(trackRes.balance).toMatchObject({ current_balance: 99, usage: 1 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Messages]).toMatchObject({
		balance: 99,
		usage: 1,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Messages]).toMatchObject({
		balance: 99,
		usage: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-BASIC2: Track with explicit value provided
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-basic2: track with explicit value provided")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-basic2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const deductValue = 23.47;
	const expectedBalance = new Decimal(100).sub(deductValue).toNumber();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deductValue,
	});

	expect(trackRes.balance).toMatchObject({
		current_balance: expectedBalance,
		usage: deductValue,
		granted_balance: 100,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Messages]).toMatchObject({
		balance: expectedBalance,
		usage: deductValue,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Messages]).toMatchObject({
		balance: expectedBalance,
		usage: deductValue,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-BASIC3: Track specific feature_id only affects that feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-basic3: track specific feature_id only affects that feature")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 100,
	});
	const action2Item = items.free({
		featureId: TestFeature.Action2,
		includedUsage: 150,
	});
	const action3Item = items.free({
		featureId: TestFeature.Action3,
		includedUsage: 200,
	});

	const freeProd = products.base({
		id: "free",
		items: [action1Item, action2Item, action3Item],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-basic3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Action1].balance).toEqual(100);
	expect(customerBefore.features[TestFeature.Action2].balance).toEqual(150);
	expect(customerBefore.features[TestFeature.Action3].balance).toEqual(200);

	const deductValue = 37.82;
	const expectedAction1Balance = new Decimal(100).sub(deductValue).toNumber();

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: deductValue,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Action1]).toMatchObject({
		balance: expectedAction1Balance,
		usage: deductValue,
	});
	expect(customer.features[TestFeature.Action2]).toMatchObject({
		balance: 150,
		usage: 0,
	});
	expect(customer.features[TestFeature.Action3]).toMatchObject({
		balance: 200,
		usage: 0,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Action1]).toMatchObject({
		balance: expectedAction1Balance,
		usage: deductValue,
	});
	expect(customerNonCached.features[TestFeature.Action2]).toMatchObject({
		balance: 150,
		usage: 0,
	});
	expect(customerNonCached.features[TestFeature.Action3]).toMatchObject({
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-BASIC4: Track with unlimited balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-basic4: track with unlimited balance")}`, async () => {
	const unlimitedMessagesItem = items.unlimitedMessages();
	const freeProd = products.base({
		id: "free",
		items: [unlimitedMessagesItem],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-basic4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toMatchObject({
		balance: 0,
		unlimited: true,
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(trackRes.balance).toMatchObject({
		feature_id: TestFeature.Messages,
		unlimited: true,
		current_balance: 0,
		usage: 0,
		granted_balance: 0,
	});
	expect(trackRes.value).toBe(1);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Messages]).toMatchObject({
		balance: 0,
		unlimited: true,
		usage: 0,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	const customerAfter10 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter10.features[TestFeature.Messages]).toMatchObject({
		balance: 0,
		unlimited: true,
		usage: 0,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1000000,
	});

	const customerAfterLarge =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterLarge.features[TestFeature.Messages]).toMatchObject({
		balance: 0,
		unlimited: true,
		usage: 0,
	});

	const trackPromises = Array.from({ length: 10 }, (_, i) =>
		autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: i + 1,
		}),
	);

	await Promise.all(trackPromises);

	const customerAfterConcurrent =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterConcurrent.features[TestFeature.Messages]).toMatchObject({
		balance: 0,
		unlimited: true,
		usage: 0,
	});
});
