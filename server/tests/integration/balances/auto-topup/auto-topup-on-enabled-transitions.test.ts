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
import {
	AUTO_TOPUP_WAIT_MS,
	DB_SYNC_WAIT_MS,
} from "./utils/autoTopupOnEnabled";

test.concurrent(
	`${chalk.yellowBright("auto-topup on-enabled 3: transitioning from disabled to enabled when balance is below threshold triggers top-up")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup on-enabled 6: multi-feature enable only triggers first feature (billing lock avoidance)")}`,
	async () => {
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
	},
);
