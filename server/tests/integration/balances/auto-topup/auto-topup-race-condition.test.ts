import { expect, test } from "bun:test";
import type { ApiCustomerV5, CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const AUTO_TOPUP_WAIT_MS = 20000;
const SYNC_SETTLE_MS = 5000;

const makeAutoTopupConfig = ({
	threshold = 20,
	quantity = 100,
}: {
	threshold?: number;
	quantity?: number;
} = {}): CustomerBillingControls => ({
	auto_topups: [
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

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.balances[TestFeature.Messages].remaining).toBe(100);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const expectedBalance = new Decimal(100).sub(85).sub(5).add(100).toNumber();

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

	await timeout(SYNC_SETTLE_MS);

	const fromDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(fromDb.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

	expect(cached.billing_controls?.auto_topups).toBeDefined();
	expect(cached.billing_controls?.auto_topups?.[0]?.feature_id).toBe(
		TestFeature.Messages,
	);
	expect(cached.billing_controls?.auto_topups?.[0]?.enabled).toBe(true);
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

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 30,
			quantity: 100,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 175,
	});

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

	await timeout(AUTO_TOPUP_WAIT_MS);

	const expectedBalance = new Decimal(200).sub(185).add(100).toNumber();

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

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

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedMid = new Decimal(100).sub(85).add(100).toNumber();
	expect(mid.balances[TestFeature.Messages].remaining).toBe(expectedMid);

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

	const expectedFinal = new Decimal(expectedMid)
		.sub(100)
		.sub(5)
		.add(100)
		.toNumber();

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(expectedFinal);

	await timeout(SYNC_SETTLE_MS);

	const fromDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(fromDb.balances[TestFeature.Messages].remaining).toBe(expectedFinal);
});
