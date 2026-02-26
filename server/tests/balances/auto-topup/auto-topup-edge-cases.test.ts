import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	type CustomerBillingControls,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 40000;

const makeAutoTopupConfig = ({
	threshold = 20,
	quantity = 100,
	enabled = true,
	maxPurchases,
}: {
	threshold?: number;
	quantity?: number;
	enabled?: boolean;
	maxPurchases?: { interval: BillingInterval; limit: number };
} = {}): CustomerBillingControls => ({
	auto_topup: [
		{
			feature_id: TestFeature.Messages,
			enabled,
			threshold,
			quantity,
			...(maxPurchases ? { max_purchases: maxPurchases } : {}),
		},
	],
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: declining card — no balance increment")}`, async () => {
	const uniqueId = `auto-topup-e1-${Date.now()}`;
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e1",
		items: [oneOffItem],
	});

	// Start with a working card, attach product, remove all PMs, then attach declining card.
	// Removing first ensures the failing card is the ONLY PM and is set as default.
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: uniqueId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	// Configure auto top-up
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Track 85 → balance = 15 → auto top-up fires → payment FAILS → balance stays at 15
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	// Balance should remain at 15 — payment failed, no increment
	expect(after.balances[TestFeature.Messages].remaining).toBe(15);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: no payment method — no top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e2",
		items: [oneOffItem],
	});

	// Start with a working card, attach product, then remove all PMs
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			// Remove all payment methods after successful attach
			s.removePaymentMethod(),
		],
	});

	// Configure auto top-up
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Track 85 → balance = 15 → auto top-up fires → no PM found → balance stays at 15
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(15);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: rate limit (max_purchases) blocks after limit")}`, async () => {
	// Dynamic customer ID ensures a fresh Redis rate limit counter on every run.
	// The key `auto_topup_count:{orgId}:{env}:{customerId}:{featureId}` has a 30-day TTL
	// and is NOT cleaned up on customer delete, so reusing the same ID across runs
	// would inherit stale counters from previous runs.
	const uniqueId = `auto-topup-e3-${Date.now()}`;
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: uniqueId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
		],
	});

	// Configure auto top-up with max_purchases = 2 per month
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 50,
			quantity: 100,
			maxPurchases: {
				interval: BillingInterval.Month,
				limit: 2,
			},
		}),
	});

	// Starting balance: 300

	// Round 1: Track 260 → balance = 40 → top-up fires (purchase 1) → balance = 140
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 260,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after1 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance1 = after1.balances[TestFeature.Messages].remaining;
	const expected1 = new Decimal(300).sub(260).add(100).toNumber();
	expect(balance1).toBe(expected1); // 140

	// Round 2: Track 100 → balance = 40 → top-up fires (purchase 2) → balance = 140
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after2 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance2 = after2.balances[TestFeature.Messages].remaining;
	const expected2 = new Decimal(140).sub(100).add(100).toNumber();
	expect(balance2).toBe(expected2); // 140

	// Round 3: Track 100 → balance = 40 → top-up BLOCKED by rate limit → balance stays at 40
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await timeout(AUTO_TOPUP_WAIT_MS);

	const after3 = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const balance3 = after3.balances[TestFeature.Messages].remaining;
	// Rate limit reached: no third top-up, balance = 140 - 100 = 40
	expect(balance3).toBe(40);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: monthly (non-one-off) feature — no trigger")}`, async () => {
	// Use a regular monthly metered product (NOT one-off)
	const monthlyItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyProd = products.base({
		id: "topup-e4-monthly",
		items: [monthlyItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e4",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [monthlyProd] }),
		],
		actions: [s.attach({ productId: monthlyProd.id })],
	});

	// Configure auto top-up (will be ignored — feature is monthly, not one-off prepaid)
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	// Track 85 → balance = 15 (below threshold)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// No top-up should occur — handler checks isOneOffPrice + isPrepaidPrice and skips
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(15);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: track exactly to threshold — no trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e5",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e5",
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

	// Track 80 → balance = exactly 20 (AT threshold, not below it)
	// threshold check is `remainingBalance >= autoTopupConfig.threshold` in triggerAutoTopUp
	// so balance=20 >= threshold=20 → does NOT trigger
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 80,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(20);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: insufficient balance rejection does NOT double-trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e6",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e6",
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

	// Track 85 → balance = 15 → auto top-up fires → balance = 115
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(100).sub(85).add(100).toNumber();
	expect(midBalance).toBe(expectedMid); // 115

	const midInvoiceCount = mid.invoices?.length ?? 0;

	// Now try to track 200 — this should either:
	// a) Succeed (deduct 200 from 115, balance → -85 capped at 0), or
	// b) Be rejected with insufficient balance
	// Either way, if the balance went to 0, the auto top-up should NOT
	// fire a second time from the rejected request path
	try {
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});
	} catch {
		// Insufficient balance rejection is expected
	}

	await timeout(AUTO_TOPUP_WAIT_MS);
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const afterInvoiceCount = after.invoices?.length ?? 0;

	// At most ONE more invoice should have been created (if the track partially
	// succeeded and brought balance below threshold again). Should NOT see
	// multiple extra invoices from the rejection path.
	const newInvoices = afterInvoiceCount - midInvoiceCount;
	expect(newInvoices).toBeLessThanOrEqual(1);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: disabling config prevents subsequent top-ups")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e7",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e7",
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

	// Enable auto top-up
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 30,
			quantity: 100,
		}),
	});

	// Round 1: Track 180 → balance=20 → top-up fires → balance=120
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 180,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(200).sub(180).add(100).toNumber(); // 120
	expect(midBalance).toBe(expectedMid);

	// Disable auto top-up between rounds
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({ enabled: false }),
	});

	// Round 2: Track 100 → balance=20 → below threshold, but config is disabled → no top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	// Balance stays at 20 — config disabled, no top-up
	expect(after.balances[TestFeature.Messages].remaining).toBe(20);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: balance depleted to exactly 0 — triggers top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e8",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e8",
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

	// Track exactly 100 → balance = 0 → 0 < 20 → should trigger top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// 0 + 100 top-up = 100
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(100);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: quantity < threshold — re-triggers on every track")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e9",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e9",
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

	// threshold=100, quantity=50 → after top-up, balance will still be below threshold.
	// This means EVERY subsequent track event will trigger another charge.
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 100,
			quantity: 50,
		}),
	});

	// Round 1: Track 170 → balance=30 → top-up fires → balance=80
	// Post-topup balance 80 is STILL below threshold 100
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 170,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(200).sub(170).add(50).toNumber(); // 80
	expect(midBalance).toBe(expectedMid);

	// Round 2: Track just 1 → balance=79 → still below threshold 100 → ANOTHER top-up fires
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const afterBalance = after.balances[TestFeature.Messages].remaining;
	// 80 - 1 + 50 = 129 (still below threshold — every track triggers a charge)
	const expectedAfter = new Decimal(80).sub(1).add(50).toNumber();
	expect(afterBalance).toBe(expectedAfter);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: multiple features top-up simultaneously")}`, async () => {
	const messagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const storageItem = items.oneOffStorage({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const messagesProd = products.oneOffAddOn({
		id: "topup-e10-msg",
		items: [messagesItem],
	});
	const storageProd = products.oneOffAddOn({
		id: "topup-e10-stor",
		items: [storageItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e10",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [messagesProd, storageProd] }),
		],
		actions: [
			s.attach({
				productId: messagesProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.attach({
				productId: storageProd.id,
				options: [{ feature_id: TestFeature.Storage, quantity: 100 }],
			}),
		],
	});

	// Configure auto top-up for BOTH features.
	// Locks are per-feature, so both SQS jobs can execute in parallel.
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topup: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					threshold: 20,
					quantity: 100,
				},
				{
					feature_id: TestFeature.Storage,
					enabled: true,
					threshold: 20,
					quantity: 100,
				},
			],
		},
	});

	// Track both features below threshold simultaneously
	await Promise.all([
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		}),
		autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Storage,
			value: 85,
		}),
	]);

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	// Both features should be independently topped up: 100 - 85 + 100 = 115
	expect(after.balances[TestFeature.Messages].remaining).toBe(115);
	expect(after.balances[TestFeature.Storage].remaining).toBe(115);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: threshold 0 — never triggers")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e11",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e11",
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

	// threshold=0 → check is `remainingBalance >= 0` → always true → never triggers.
	// This documents the behavior: a zero threshold effectively disables auto top-up.
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 0,
			quantity: 100,
		}),
	});

	// Track 50 → balance = 50 → 50 >= 0 → no trigger
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(after.balances[TestFeature.Messages].remaining).toBe(50);
});

test.concurrent(`${chalk.yellowBright("auto-topup edge: lowered threshold respected on next trigger")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-e12",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-e12",
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

	// Start with threshold=50
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 50,
			quantity: 100,
		}),
	});

	// Round 1: Track 160 → balance=40 → 40 < 50 → top-up fires → balance=140
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 160,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midBalance = mid.balances[TestFeature.Messages].remaining;
	const expectedMid = new Decimal(200).sub(160).add(100).toNumber(); // 140
	expect(midBalance).toBe(expectedMid);

	// Lower threshold to 10 between rounds
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 10,
			quantity: 100,
		}),
	});

	// Round 2: Track 105 → balance=35 → below OLD threshold (50) but ABOVE new threshold (10)
	// The trigger uses the current config (threshold=10), so 35 >= 10 → no top-up
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 105,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	// Balance stays at 35 — above new threshold, no top-up
	expect(after.balances[TestFeature.Messages].remaining).toBe(35);
});
