import { expect, test } from "bun:test";
import type { ApiCustomerV5, CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

/** SQS auto top-up wait + sync settle time */
const AUTO_TOPUP_WAIT_MS = 20000;
const SYNC_SETTLE_MS = 5000;

const makeAutoTopupConfig = ({
	threshold = 20,
	quantity = 100,
}: {
	threshold?: number;
	quantity?: number;
} = {}): CustomerBillingControls => ({
	auto_topup: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			threshold,
			quantity,
		},
	],
});

test.concurrent(`${chalk.yellowBright("auto-topup race: concurrent track during auto top-up — Redis and Postgres agree")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-race1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-race1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Configure auto top-up: threshold=20, quantity=100
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Verify starting balance
	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.balances[TestFeature.Messages].remaining).toBe(100);

	// Track 85 → balance = 15 (triggers auto top-up via SQS)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	// Immediately track 5 more — concurrent with the in-flight auto top-up
	// This exercises the race between:
	//   1. Deduction sync (Redis → Postgres, 1s delay)
	//   2. Auto top-up (CusEntService.increment + Redis increment with cache_version bump)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});

	// Wait for auto top-up processing + sync settlement
	await timeout(AUTO_TOPUP_WAIT_MS);

	// Expected balance: 100 - 85 - 5 + 100 = 110
	const expectedBalance = new Decimal(100).sub(85).sub(5).add(100).toNumber();

	// 1. Check cached balance (Redis-backed)
	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

	// 2. Wait for sync to fully settle, then check DB balance
	await timeout(SYNC_SETTLE_MS);

	const fromDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(fromDb.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

	// 3. Verify billing_controls survived
	expect(cached.billing_controls?.auto_topup).toBeDefined();
	expect(cached.billing_controls?.auto_topup?.[0]?.feature_id).toBe(
		TestFeature.Messages,
	);
	expect(cached.billing_controls?.auto_topup?.[0]?.enabled).toBe(true);
});

test.concurrent(`${chalk.yellowBright("auto-topup race: rapid sequential tracks — deductions interleaved with top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-race2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-race2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Configure auto top-up: threshold=30, quantity=100
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 30,
			quantity: 100,
		}),
	});

	// Starting balance: 200
	// Track 175 → balance = 25 (triggers auto top-up)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 175,
	});

	// Fire 3 more small tracks while auto top-up is in-flight
	// Each deduction hits Redis immediately, but sync to Postgres is delayed
	await Promise.all([
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		}),
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		}),
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 4,
		}),
	]);

	// Total deducted: 175 + 3 + 3 + 4 = 185
	// After top-up: 200 - 185 + 100 = 115
	await timeout(AUTO_TOPUP_WAIT_MS);

	const expectedBalance = new Decimal(200).sub(185).add(100).toNumber();

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

	// Verify DB matches after sync settles
	await timeout(SYNC_SETTLE_MS);

	const fromDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(fromDb.balances[TestFeature.Messages].remaining).toBe(expectedBalance);
});

test.concurrent(`${chalk.yellowBright("auto-topup race: top-up then immediate re-drain — second top-up fires correctly")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-race3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-race3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Configure auto top-up: threshold=20, quantity=100
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Round 1: Track 85 → balance = 15 → top-up fires → balance = 115
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedMid = new Decimal(100).sub(85).add(100).toNumber();
	expect(mid.balances[TestFeature.Messages].remaining).toBe(expectedMid);

	// Round 2: Track 100 → balance = 15 → second top-up fires
	// Then immediately track 5 more (concurrent with second top-up)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Expected: 115 - 100 - 5 + 100 = 110
	const expectedFinal = new Decimal(expectedMid)
		.sub(100)
		.sub(5)
		.add(100)
		.toNumber();

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(expectedFinal);

	// Verify DB after sync
	await timeout(SYNC_SETTLE_MS);

	const fromDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(fromDb.balances[TestFeature.Messages].remaining).toBe(expectedFinal);
});
