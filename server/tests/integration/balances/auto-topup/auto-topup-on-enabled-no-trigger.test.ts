import { test } from "bun:test";
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
	`${chalk.yellowBright("auto-topup on-enabled 2: enabling auto-topup when balance is above threshold does NOT trigger top-up")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup on-enabled 4: updating already-enabled config does NOT re-trigger top-up")}`,
	async () => {
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
	},
);
