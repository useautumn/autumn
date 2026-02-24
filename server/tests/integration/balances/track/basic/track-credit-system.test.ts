import { expect, test } from "bun:test";

import type { ApiCustomerV3, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

// ═══════════════════════════════════════════════════════════════════
// CREDIT-SYSTEM1: Track credits directly
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-credit-system1: track credits directly")}`, async () => {
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [creditsItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "credit-system1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Credits].balance).toBe(100);

	const deductValue = 27.35;

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		value: deductValue,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features[TestFeature.Credits]).toMatchObject({
		balance: 100 - deductValue,
		usage: deductValue,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Credits]).toMatchObject({
		balance: 100 - deductValue,
		usage: deductValue,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT-SYSTEM2: Track metered features using credit system
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-credit-system2: track metered features using credit system")}`, async () => {
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 200,
	});
	const freeProd = products.base({
		id: "free",
		items: [creditsItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "credit-system2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Credits].balance).toBe(200);

	const action1Value = 50.25;
	const expectedAction1CreditCost = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: action1Value,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: action1Value,
	});

	const customerAfterAction1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterAction1.features[TestFeature.Credits]).toMatchObject({
		balance: 200 - expectedAction1CreditCost,
		usage: expectedAction1CreditCost,
	});

	const action2Value = 33.67;
	const expectedAction2CreditCost = getCreditCost({
		featureId: TestFeature.Action2,
		creditSystem: creditFeature!,
		amount: action2Value,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action2,
		value: action2Value,
	});

	const customerAfterAction2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const expectedBalanceAfterBoth = new Decimal(200)
		.minus(expectedAction1CreditCost)
		.minus(expectedAction2CreditCost)
		.toNumber();
	const expectedUsageAfterBoth = new Decimal(expectedAction1CreditCost)
		.plus(expectedAction2CreditCost)
		.toNumber();

	expect(customerAfterAction2.features[TestFeature.Credits]).toMatchObject({
		balance: expectedBalanceAfterBoth,
		usage: expectedUsageAfterBoth,
	});

	await timeout(2000);

	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Credits]).toMatchObject({
		balance: expectedBalanceAfterBoth,
		usage: expectedUsageAfterBoth,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT-SYSTEM3: Deduction order - action1 first, then credits
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-credit-system3: test deduction order - action1 first, then credits")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 100,
	});
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 200,
	});
	const freeProd = products.base({
		id: "free",
		items: [action1Item, creditsItem],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "credit-system3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Action1].balance).toBe(100);
	expect(customerBefore.features[TestFeature.Credits].balance).toBe(200);

	const deduct1 = 40.5;
	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: deduct1,
	});

	expect(trackRes1.balance).toMatchObject({
		feature_id: TestFeature.Action1,
		current_balance: 100 - deduct1,
		usage: deduct1,
	});

	await timeout(2000);
	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customer1.features[TestFeature.Action1]).toMatchObject({
		balance: 100 - deduct1,
		usage: deduct1,
	});
	expect(customer1.features[TestFeature.Credits]).toMatchObject({
		balance: 200,
		usage: 0,
	});

	const deduct2 = 80;
	const remainingAction1 = 100 - deduct1;
	const overflowAmount = deduct2 - remainingAction1;
	const creditCostForOverflow = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: overflowAmount,
	});

	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: deduct2,
	});

	expect(trackRes2.balance).toMatchObject({
		feature_id: TestFeature.Action1,
		current_balance: 0,
		usage: 100,
	});

	await timeout(2000);
	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customer2.features[TestFeature.Action1]).toMatchObject({
		balance: 0,
		usage: 100,
	});
	expect(customer2.features[TestFeature.Credits]).toMatchObject({
		balance: 200 - creditCostForOverflow,
		usage: creditCostForOverflow,
	});

	const creditsBefore = customer2.features[TestFeature.Credits].balance;
	const deduct3 = 50.75;
	const creditCost3 = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: deduct3,
	});

	const trackRes3: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: deduct3,
	});

	expect(trackRes3.balance).toMatchObject({
		feature_id: TestFeature.Credits,
		current_balance: new Decimal(creditsBefore!).minus(creditCost3).toNumber(),
	});

	await timeout(2000);
	const customer3 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customer3.features[TestFeature.Action1].balance).toBe(0);
	expect(customer3.features[TestFeature.Credits].balance).toBe(
		new Decimal(creditsBefore!).minus(creditCost3).toNumber(),
	);

	const expectedCreditsBalance = new Decimal(200)
		.minus(creditCostForOverflow)
		.minus(creditCost3)
		.toNumber();
	const expectedCreditsUsage = new Decimal(creditCostForOverflow)
		.plus(creditCost3)
		.toNumber();

	expect(customer3.features[TestFeature.Action1]).toMatchObject({
		balance: 0,
		usage: 100,
	});
	expect(customer3.features[TestFeature.Credits]).toMatchObject({
		balance: expectedCreditsBalance,
		usage: expectedCreditsUsage,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT-SYSTEM4: Two credit system pairs - Action1→Credits, Action3→Credits2
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-credit-system4: test deduction with two credit system pairs")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 80,
	});
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 150,
	});
	const action3Item = items.free({
		featureId: TestFeature.Action3,
		includedUsage: 60,
	});
	const credits2Item = items.free({
		featureId: TestFeature.Credits2,
		includedUsage: 100,
	});
	const freeProd = products.base({
		id: "free",
		items: [action1Item, creditsItem, action3Item, credits2Item],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "credit-system4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);
	const credit2Feature = ctx.features.find(
		(f) => f.id === TestFeature.Credits2,
	);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Action1].balance).toBe(80);
	expect(customerBefore.features[TestFeature.Credits].balance).toBe(150);
	expect(customerBefore.features[TestFeature.Action3].balance).toBe(60);
	expect(customerBefore.features[TestFeature.Credits2].balance).toBe(100);

	const deduct1 = 25.5;
	const trackRes1: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "action-event",
		value: deduct1,
	});

	expect(trackRes1.balances?.[TestFeature.Action1]).toBeDefined();
	expect(trackRes1.balances?.[TestFeature.Action3]).toBeDefined();
	expect(trackRes1.balances?.[TestFeature.Credits]).toBeUndefined();
	expect(trackRes1.balances?.[TestFeature.Credits2]).toBeUndefined();

	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer1.features[TestFeature.Action1]).toMatchObject({
		balance: new Decimal(80).sub(deduct1).toNumber(),
		usage: deduct1,
	});
	expect(customer1.features[TestFeature.Action3]).toMatchObject({
		balance: new Decimal(60).sub(deduct1).toNumber(),
		usage: deduct1,
	});
	expect(customer1.features[TestFeature.Credits].balance).toBe(150);
	expect(customer1.features[TestFeature.Credits2].balance).toBe(100);

	const remainingAction1 = new Decimal(80).sub(deduct1).toNumber();
	const remainingAction3 = new Decimal(60).sub(deduct1).toNumber();
	const creditsBefore = customer1.features[TestFeature.Credits].balance!;
	const credits2Before = customer1.features[TestFeature.Credits2].balance!;

	const deduct2 = 70;
	const overflowAction1 = deduct2 - remainingAction1;
	const overflowAction3 = deduct2 - remainingAction3;

	const creditCostAction1 = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: overflowAction1,
	});

	const creditCostAction3 = getCreditCost({
		featureId: TestFeature.Action3,
		creditSystem: credit2Feature!,
		amount: overflowAction3,
	});

	const trackRes2: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "action-event",
		value: deduct2,
	});

	expect(trackRes2.balances?.[TestFeature.Action1]).toBeDefined();
	expect(trackRes2.balances?.[TestFeature.Action3]).toBeDefined();
	expect(trackRes2.balances?.[TestFeature.Credits]).toBeUndefined();
	expect(trackRes2.balances?.[TestFeature.Credits2]).toBeUndefined();

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer2.features[TestFeature.Action1]).toMatchObject({
		balance: 0,
		usage: 80,
	});
	expect(customer2.features[TestFeature.Action3]).toMatchObject({
		balance: 0,
		usage: 60,
	});
	expect(customer2.features[TestFeature.Credits].balance).toBe(
		new Decimal(creditsBefore).sub(creditCostAction1).toNumber(),
	);
	expect(customer2.features[TestFeature.Credits2].balance).toBe(
		new Decimal(credits2Before).sub(creditCostAction3).toNumber(),
	);

	const creditsBeforeDeduct3 = customer2.features[TestFeature.Credits].balance!;
	const credits2BeforeDeduct3 =
		customer2.features[TestFeature.Credits2].balance!;

	const deduct3 = 40.25;

	const creditCostAction1Deduct3 = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: deduct3,
	});

	const creditCostAction3Deduct3 = getCreditCost({
		featureId: TestFeature.Action3,
		creditSystem: credit2Feature!,
		amount: deduct3,
	});

	const trackRes3: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		event_name: "action-event",
		value: deduct3,
	});

	expect(trackRes3.balances?.[TestFeature.Action1]).toBeUndefined();
	expect(trackRes3.balances?.[TestFeature.Action3]).toBeUndefined();
	expect(trackRes3.balances?.[TestFeature.Credits]).toBeDefined();
	expect(trackRes3.balances?.[TestFeature.Credits2]).toBeDefined();

	const customer3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer3.features[TestFeature.Action1].balance).toBe(0);
	expect(customer3.features[TestFeature.Action3].balance).toBe(0);
	expect(customer3.features[TestFeature.Credits].balance).toBe(
		new Decimal(creditsBeforeDeduct3).sub(creditCostAction1Deduct3).toNumber(),
	);
	const expectedCredits2 = new Decimal(credits2BeforeDeduct3)
		.sub(creditCostAction3Deduct3)
		.toNumber();
	expect(customer3.features[TestFeature.Credits2].balance).toBe(
		Math.max(0, expectedCredits2),
	);

	await timeout(2000);

	const expectedCreditsBalance = new Decimal(150)
		.sub(creditCostAction1)
		.sub(creditCostAction1Deduct3)
		.toNumber();
	const expectedCredits2Balance = Math.max(
		0,
		new Decimal(100)
			.sub(creditCostAction3)
			.sub(creditCostAction3Deduct3)
			.toNumber(),
	);

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerFinal.features[TestFeature.Action1]).toMatchObject({
		balance: 0,
		usage: 80,
	});
	expect(customerFinal.features[TestFeature.Action3]).toMatchObject({
		balance: 0,
		usage: 60,
	});
	expect(customerFinal.features[TestFeature.Credits].balance).toBe(
		expectedCreditsBalance,
	);
	expect(customerFinal.features[TestFeature.Credits2].balance).toBe(
		expectedCredits2Balance,
	);
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT-SYSTEM5: Same as system3 but with skipCache option
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-credit-system5: test deduction order with skipCache option")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
		includedUsage: 100,
	});
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 200,
	});
	const freeProd = products.base({
		id: "free",
		items: [action1Item, creditsItem],
	});

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "credit-system5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Action1].balance).toBe(100);
	expect(customerBefore.features[TestFeature.Credits].balance).toBe(200);

	const deduct1 = 40.5;
	const trackRes1: TrackResponseV2 = await autumnV2.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: deduct1,
		},
		{
			skipCache: true,
		},
	);

	expect(trackRes1.balance).toMatchObject({
		feature_id: TestFeature.Action1,
		current_balance: 100 - deduct1,
		usage: deduct1,
	});

	await timeout(2000);
	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customer1.features[TestFeature.Action1]).toMatchObject({
		balance: 100 - deduct1,
		usage: deduct1,
	});
	expect(customer1.features[TestFeature.Credits]).toMatchObject({
		balance: 200,
		usage: 0,
	});

	const deduct2 = 80;
	const remainingAction1 = 100 - deduct1;
	const overflowAmount = deduct2 - remainingAction1;
	const creditCostForOverflow = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: overflowAmount,
	});

	const trackRes2: TrackResponseV2 = await autumnV2.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: deduct2,
		},
		{
			skipCache: true,
		},
	);

	expect(trackRes2.balance).toMatchObject({
		feature_id: TestFeature.Action1,
		current_balance: 0,
		usage: 100,
	});

	await timeout(2000);
	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customer2.features[TestFeature.Action1]).toMatchObject({
		balance: 0,
		usage: 100,
	});
	expect(customer2.features[TestFeature.Credits]).toMatchObject({
		balance: 200 - creditCostForOverflow,
		usage: creditCostForOverflow,
	});

	const creditsBefore = customer2.features[TestFeature.Credits].balance;
	const deduct3 = 50.75;
	const creditCost3 = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: deduct3,
	});

	const trackRes3: TrackResponseV2 = await autumnV2.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: deduct3,
		},
		{
			skipCache: true,
		},
	);

	expect(trackRes3.balance).toMatchObject({
		feature_id: TestFeature.Credits,
		current_balance: new Decimal(creditsBefore!).minus(creditCost3).toNumber(),
	});

	await timeout(2000);
	const customer3 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(customer3.features[TestFeature.Action1].balance).toBe(0);
	expect(customer3.features[TestFeature.Credits].balance).toBe(
		new Decimal(creditsBefore!).minus(creditCost3).toNumber(),
	);
});
