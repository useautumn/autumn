/**
 * Parity twin of `migrations update_plan: free version update carries usage`:
 * batch repoints in place, per-customer expires + re-inserts, but the
 * projected customer state (balances, plan version, invoices) must match.
 */
import { test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { expectCustomerEntitlementRowCount } from "../../batchTestUtils";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectActivePlanVersion,
	migrateVersionOnBatchLane,
	migrateVersionOnPerCustomerLane,
	mintPlanVersion,
	uniqueStem,
} from "./versionParityTestUtils";

test.skip(
	`${chalk.yellowBright("batch version repoint parity: free version update carries usage")}`,
	async () => {
		const stem = uniqueStem("bvr-parity-usage");
		const batchCustomerId = `${stem}-batch`;
		const perCustomerId = `${stem}-customer`;
		const batchPlan = products.base({
			id: `${stem}-plan-a`,
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const perCustomerPlan = products.base({
			id: `${stem}-plan-b`,
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: batchCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: perCustomerId }]),
				s.products({ list: [batchPlan, perCustomerPlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: batchPlan.id }),
					s.billing.attach({
						customerId: perCustomerId,
						productId: perCustomerPlan.id,
					}),
				),
			],
		});

		for (const customerId of [batchCustomerId, perCustomerId]) {
			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 100,
			});
			await pollUntil({
				fetch: () =>
					readScopedFeatureRow({
						ctx,
						customerId,
						featureId: TestFeature.Messages,
					}),
				until: (row) => row.balance === 400,
				timeoutMs: 15_000,
				intervalMs: 250,
			});
		}

		for (const planId of [batchPlan.id, perCustomerPlan.id]) {
			await mintPlanVersion({
				autumnV2_3,
				planId,
				items: [itemsV2.monthlyMessages({ included: 600 })],
			});
		}
		await migrateVersionOnBatchLane({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-batch-migration`,
			planId: batchPlan.id,
		});
		await migrateVersionOnPerCustomerLane({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-customer-migration`,
			planId: perCustomerPlan.id,
			customerId: perCustomerId,
		});

		for (const [customerId, planId] of [
			[batchCustomerId, batchPlan.id],
			[perCustomerId, perCustomerPlan.id],
		] as const) {
			expectBalanceCorrect({
				customer: await autumnV2_3.customers.get<ApiCustomerV5>(customerId),
				featureId: TestFeature.Messages,
				remaining: 500,
				usage: 100,
				planId,
			});
			await expectActivePlanVersion({ ctx, customerId, planId, version: 2 });
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId,
				featureId: TestFeature.Messages,
				count: 1,
			});
			await expectCustomerInvoiceCorrect({
				customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
				count: 0,
			});
		}
	},
);
