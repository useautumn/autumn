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
// TRACK-EVENT-NAME1: Track using event_name instead of feature_id (single feature)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-event-name1: track with event_name instead of feature_id")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 150,
	});

	const freeProd = products.base({
		id: "free",
		items: [action1Item],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-event-name1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Action1].balance).toEqual(150);

	const deductValue = 37.89;
	const expectedBalance = new Decimal(150).sub(deductValue).toNumber();

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "action-event",
		value: deductValue,
	});

	expect(trackRes.balance).toBeDefined();
	expect(trackRes.balance?.feature_id).toBe(TestFeature.Action1);
	expect(trackRes.balance?.current_balance).toBe(expectedBalance);
	expect(trackRes.balance?.usage).toBe(deductValue);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Action1]).toMatchObject({
		balance: expectedBalance,
		usage: deductValue,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Action1]).toMatchObject({
		balance: expectedBalance,
		usage: deductValue,
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-EVENT-NAME2: Track with event_name deducts from multiple features
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-event-name2: track with event_name deducts from multiple features")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 200,
	});
	const action3Item = items.free({
		featureId: TestFeature.Action3,
		includedUsage: 150,
	});

	const freeProd = products.base({
		id: "free",
		items: [action1Item, action3Item],
	});

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "track-event-name2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Action1].balance).toEqual(200);
	expect(customerBefore.features[TestFeature.Action3].balance).toEqual(150);

	const deductValue = 45.67;
	const expectedAction1Balance = new Decimal(200).sub(deductValue).toNumber();
	const expectedAction3Balance = new Decimal(150).sub(deductValue).toNumber();

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "action-event",
		value: deductValue,
	});

	expect(trackRes.value).toBe(deductValue);
	expect(trackRes.balance).toBeNull();
	expect(trackRes.balances).toBeDefined();
	expect(trackRes.balances?.[TestFeature.Action1]?.current_balance).toBe(
		expectedAction1Balance,
	);
	expect(trackRes.balances?.[TestFeature.Action1]?.usage).toBe(deductValue);
	expect(trackRes.balances?.[TestFeature.Action3]?.current_balance).toBe(
		expectedAction3Balance,
	);
	expect(trackRes.balances?.[TestFeature.Action3]?.usage).toBe(deductValue);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Action1]).toMatchObject({
		balance: expectedAction1Balance,
		usage: deductValue,
	});
	expect(customer.features[TestFeature.Action3]).toMatchObject({
		balance: expectedAction3Balance,
		usage: deductValue,
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
	expect(customerNonCached.features[TestFeature.Action3]).toMatchObject({
		balance: expectedAction3Balance,
		usage: deductValue,
	});
});
