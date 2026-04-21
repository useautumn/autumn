import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 40000;

/** Wait time for Redis → Postgres balance sync */
const DB_SYNC_WAIT_MS = 4000;

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 1: enabling auto-topup when balance is below threshold triggers immediate top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-on-enabled-1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Deplete balance to 15 (below future threshold of 20)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	// Wait for Redis → Postgres sync so updateCustomer reads correct balance
	await timeout(DB_SYNC_WAIT_MS);

	// Verify pre-config balance
	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: before,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	// Enable auto-topup: balance (15) is below threshold (20) → should trigger immediately
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should be: 15 + 100 = 115
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 115,
	});

	// 2 invoices: initial attach + auto top-up
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 2: enabling auto-topup when balance is above threshold does NOT trigger top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-on-enabled-2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Deplete balance to 50 (above threshold of 20)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	// Wait for Redis → Postgres sync
	await timeout(DB_SYNC_WAIT_MS);

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: before,
		featureId: TestFeature.Messages,
		remaining: 50,
	});

	// Enable auto-topup: balance (50) is above threshold (20) → should NOT trigger
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should remain at 50 — no top-up fired
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 50,
	});

	// Only 1 invoice: initial attach only
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 3: transitioning from disabled to enabled when balance is below threshold triggers top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-on-enabled-3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Deplete balance to 10 (below threshold)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 90,
	});

	// Wait for Redis → Postgres sync
	await timeout(DB_SYNC_WAIT_MS);

	// Set up DISABLED auto-topup config first
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: false,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Verify no top-up fired while disabled
	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});

	// Now transition disabled → enabled with balance (10) < threshold (20)
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should be: 10 + 100 = 110
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 110,
	});

	// 2 invoices: initial attach + auto top-up from enable transition
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 4: updating already-enabled config does NOT re-trigger top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-on-enabled-4",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-4",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Deplete balance to 15 (below threshold)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	// Wait for Redis → Postgres sync
	await timeout(DB_SYNC_WAIT_MS);

	// Enable auto-topup → triggers first top-up (balance 15 → 115)
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Messages,
		remaining: 115,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});

	// Update the same config — change threshold/quantity but keep enabled=true (no transition)
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 30,
			quantity: 200,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should still be 115 — no additional top-up
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 115,
	});

	// Still only 2 invoices — no re-trigger
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 5: enabling auto-topup with zero balance triggers immediate top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-on-enabled-5",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-5",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Deplete ALL balance to 0
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	// Wait for Redis → Postgres sync
	await timeout(DB_SYNC_WAIT_MS);

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: before,
		featureId: TestFeature.Messages,
		remaining: 0,
	});

	// Enable auto-topup with zero balance (0 < 20) → should trigger immediately
	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should be: 0 + 100 = 100
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 100,
	});

	// 2 invoices: initial attach + auto top-up
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 6: multi-feature enable only triggers first feature (billing lock avoidance)")}`, async () => {
	// Two features: Messages (disabled→enabled) and Storage (undefined→enabled)
	// Only the first feature in the auto_topups array should trigger a top-up
	const messagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const storageItem = items.oneOffStorage({
		includedUsage: 0,
		billingUnits: 100,
		price: 5,
	});
	const messagesProd = products.base({
		id: "topup-on-enabled-6-msg",
		items: [messagesItem],
	});
	const storageProd = products.base({
		id: "topup-on-enabled-6-str",
		items: [storageItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-6",
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

	// Deplete both balances below their thresholds
	// Messages: 100 → 10 (below threshold 20)
	// Storage: 100 → 5 (below threshold 15)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 90,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Storage,
		value: 95,
	});

	// Wait for Redis → Postgres sync
	await timeout(DB_SYNC_WAIT_MS);

	// Set Messages auto-topup as DISABLED (Storage has no config at all → undefined case)
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topups: [
				{
					feature_id: TestFeature.Messages,
					enabled: false,
					threshold: 20,
					quantity: 100,
				},
			],
		},
	});

	// Wait for config to persist (no top-up expected — Messages disabled, Storage undefined)
	await timeout(DB_SYNC_WAIT_MS);

	// Verify no top-ups fired
	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Messages,
		remaining: 10,
	});
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Storage,
		remaining: 5,
	});

	// Now enable BOTH in a single update:
	// Messages: disabled → enabled (transition)
	// Storage: undefined → enabled (transition)
	// Only the first feature in the array should trigger a top-up
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topups: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					threshold: 20,
					quantity: 100,
				},
				{
					feature_id: TestFeature.Storage,
					enabled: true,
					threshold: 15,
					quantity: 100,
				},
			],
		},
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Exactly one feature should have been topped up (non-deterministic which one)
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const messagesBalance = after.balances[TestFeature.Messages].remaining;
	const storageBalance = after.balances[TestFeature.Storage].remaining;

	const messagesToppedUp = messagesBalance === 110;
	const storageToppedUp = storageBalance === 105;

	// Exactly one should have triggered, not both
	expect(messagesToppedUp || storageToppedUp).toBe(true);
	expect(messagesToppedUp && storageToppedUp).toBe(false);
});

test.concurrent(`${chalk.yellowBright("auto-topup on-enabled 7: enabling via RPC customers.update endpoint triggers immediate top-up")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: "topup-on-enabled-7",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-on-enabled-7",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Deplete balance to 15 (below future threshold of 20)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(DB_SYNC_WAIT_MS);

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: before,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	// Enable auto-topup via RPC route (POST /customers.update → handleUpdateCustomerV2)
	await autumnV2_1.customers.updateRpc(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			enabled: true,
		}),
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	// Balance should be: 15 + 100 = 115
	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 115,
	});

	// 2 invoices: initial attach + auto top-up
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: prod.id,
	});
});
