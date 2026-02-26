import { expect, test } from "bun:test";
import type { ApiCustomerV5, CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 15000;

const makeAutoTopupConfig = ({
	threshold = 20,
	quantity = 100,
	enabled = true,
}: {
	threshold?: number;
	quantity?: number;
	enabled?: boolean;
} = {}): CustomerBillingControls => ({
	auto_topup: [
		{
			feature_id: TestFeature.Messages,
			enabled,
			threshold,
			quantity,
		},
	],
});

test.concurrent(`${chalk.yellowBright("auto-topup basic: track below threshold triggers top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-b1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-b1",
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

	// Track 85 → balance drops to 15 (below threshold of 20)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	// Wait for auto top-up to process via SQS
	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should be: 100 - 85 + 100 = 115
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedBalance = new Decimal(100).sub(85).add(100).toNumber();
	expect(after.balances[TestFeature.Messages].remaining).toBe(expectedBalance);
});

test.concurrent(`${chalk.yellowBright("auto-topup basic: track above threshold does NOT trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-b2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-b2",
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

	// Get initial invoice count
	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const initialInvoiceCount = before.invoices?.length ?? 0;

	// Track 50 → balance drops to 50 (above threshold of 20)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should remain at 50 — no top-up
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(50);

	// No new invoice created
	const afterInvoiceCount = after.invoices?.length ?? 0;
	expect(afterInvoiceCount).toBe(initialInvoiceCount);
});

test.concurrent(`${chalk.yellowBright("auto-topup basic: disabled config does NOT trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-b3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-b3",
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

	// Configure auto top-up but DISABLED
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: false,
		}),
	});

	// Track 85 → balance drops to 15 (below threshold)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should stay at 15 — disabled, no top-up
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(15);
});

test.concurrent(`${chalk.yellowBright("auto-topup basic: sequential tracks each trigger separate top-ups")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-b4",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-b4",
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
	// Track 180 → balance = 20 (below threshold 30) → top-up fires → balance = 120
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 180,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	// 200 - 180 + 100 = 120
	const expectedMid = new Decimal(200).sub(180).add(100).toNumber();
	expect(mid.balances[TestFeature.Messages].remaining).toBe(expectedMid);

	// Track 100 → balance = 20 (below threshold 30 again) → second top-up fires → balance = 120
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	// 120 - 100 + 100 = 120
	const expectedAfter = new Decimal(120).sub(100).add(100).toNumber();
	expect(after.balances[TestFeature.Messages].remaining).toBe(expectedAfter);
});

test.concurrent(`${chalk.yellowBright("auto-topup basic: cache and DB agree after top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-b5",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-b5",
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

	// Track 85 → triggers top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	// Wait for top-up + DB sync
	await timeout(AUTO_TOPUP_WAIT_MS);

	// Verify cached balance (from Redis)
	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedBalance = new Decimal(100).sub(85).add(100).toNumber();
	expect(cached.balances[TestFeature.Messages].remaining).toBe(expectedBalance);

	// Wait additional time for DB sync to settle
	await timeout(3000);

	// Verify DB balance (skip cache)
	const fromDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(fromDb.balances[TestFeature.Messages].remaining).toBe(expectedBalance);
});
