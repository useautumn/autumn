/**
 * One version diff carrying add + remove + replace: both lanes must land the
 * replaced allowance with usage carried, mint the added feature fresh, and
 * drop the removed feature entirely.
 */
import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../../batchTestUtils";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectActivePlanVersion,
	migrateVersionOnBatchLane,
	migrateVersionOnPerCustomerLane,
	mintPlanVersion,
	uniqueStem,
} from "./versionParityTestUtils";

const v1Items = () => [
	items.monthlyMessages({ includedUsage: 100 }),
	items.monthlyWords({ includedUsage: 50 }),
];
// Messages replaced (100→200), Words removed, Credits added.
const v2Items = () => [
	itemsV2.monthlyMessages({ included: 200 }),
	itemsV2.monthlyCredits({ included: 75 }),
];

test.concurrent(
	`${chalk.yellowBright("batch version repoint parity: add + remove + replace in one version diff")}`,
	async () => {
		const stem = uniqueStem("bvr-parity-arr");
		const batchCustomerId = `${stem}-batch`;
		const perCustomerId = `${stem}-customer`;
		const batchPlan = products.base({ id: `${stem}-plan-a`, items: v1Items() });
		const perCustomerPlan = products.base({
			id: `${stem}-plan-b`,
			items: v1Items(),
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
				value: 30,
			});
			await pollUntil({
				fetch: () =>
					readScopedFeatureRow({
						ctx,
						customerId,
						featureId: TestFeature.Messages,
					}),
				until: (row) => row.balance === 70,
				timeoutMs: 15_000,
				intervalMs: 250,
			});
		}

		for (const planId of [batchPlan.id, perCustomerPlan.id]) {
			await mintPlanVersion({ autumnV2_3, planId, items: v2Items() });
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
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				remaining: 170,
				usage: 30,
				planId,
			});
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Credits,
				remaining: 75,
				usage: 0,
				planId,
			});
			expect(customer.balances[TestFeature.Words]).toBeUndefined();
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId,
				featureId: TestFeature.Words,
				count: 0,
			});
			await expectActivePlanVersion({ ctx, customerId, planId, version: 2 });
		}
	},
);
