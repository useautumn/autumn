import { expect, test } from "bun:test";
import type { ApiCustomerV5, CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

/** Wait time for SQS auto top-up processing (concurrent needs more time) */
const AUTO_TOPUP_WAIT_MS = 20000;

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

test.concurrent(`${chalk.yellowBright("auto-topup concurrent: burst of concurrent tracks — only one top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-c1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-c1",
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

	// Configure auto top-up: threshold=50, quantity=100
	// With 100 starting balance, any track of 51+ should cross threshold
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 50,
			quantity: 100,
		}),
	});

	// Fire 3 concurrent tracks of 20 each (total: 60 deducted)
	// After all deductions: balance = 100 - 60 = 40 (below threshold 50)
	// Multiple jobs may be enqueued, but only ONE should execute (balance re-check)
	await Promise.all([
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		}),
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		}),
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		}),
	]);

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Expected: 100 - 60 + 100 = 140 (exactly ONE top-up of 100)
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance = after.balances[TestFeature.Messages].remaining;
	const expectedBalance = new Decimal(100).sub(60).add(100).toNumber();

	expect(balance).toBe(expectedBalance);
});

test.concurrent(`${chalk.yellowBright("auto-topup concurrent: 5 concurrent small tracks — at most one top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-c2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-c2",
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

	// Configure threshold=20, quantity=100
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Fire 5 concurrent tracks of 18 each (total: 90 deducted)
	// Final balance after deductions: 100 - 90 = 10 (below threshold 20)
	// Multiple SQS jobs enqueued, but handler re-checks balance — only one should execute
	await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 18,
			}),
		),
	);

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance = after.balances[TestFeature.Messages].remaining;

	// Expected: 100 - 90 + 100 = 110 (exactly one top-up)
	const expectedBalance = new Decimal(100).sub(90).add(100).toNumber();
	expect(balance).toBe(expectedBalance);
});

test.concurrent(`${chalk.yellowBright("auto-topup concurrent: sequential drain → top-up → drain → top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-c3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-c3",
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

	// Round 1: Track 85 → balance = 15 → top-up fires → balance = 115
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(100).sub(85).add(100).toNumber();
	expect(midBalance).toBe(expectedMid);

	// Round 2: Track 100 → balance = 15 → second top-up fires → balance = 115
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const afterBalance = after.balances[TestFeature.Messages].remaining;
	const expectedAfter = new Decimal(115).sub(100).add(100).toNumber();
	expect(afterBalance).toBe(expectedAfter);
});
