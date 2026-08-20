/**
 * v2 re-mints identical rows: batch repoints claims in place, per-customer
 * re-inserts rows — both lanes must project the same feature access and
 * balances afterwards.
 */
import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectActivePlanVersion,
	migrateVersionOnBatchLane,
	migrateVersionOnPerCustomerLane,
	mintPlanVersion,
	uniqueStem,
} from "./versionParityTestUtils";

const planItems = () => [
	items.monthlyMessages({ includedUsage: 100 }),
	items.dashboard(),
];
// v2 re-mint of the same definitions, in the shape /plans.update accepts.
const planItemsV2 = () => [
	itemsV2.monthlyMessages({ included: 100 }),
	itemsV2.dashboard(),
];

test.concurrent(
	`${chalk.yellowBright("batch version repoint parity: identical-definition repoint matches feature access and balances")}`,
	async () => {
		const stem = uniqueStem("bvr-parity-identical");
		const batchCustomerId = `${stem}-batch`;
		const perCustomerId = `${stem}-customer`;
		const batchPlan = products.base({
			id: `${stem}-plan-a`,
			items: planItems(),
		});
		const perCustomerPlan = products.base({
			id: `${stem}-plan-b`,
			items: planItems(),
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
				value: 40,
			});
			await pollUntil({
				fetch: () =>
					readScopedFeatureRow({
						ctx,
						customerId,
						featureId: TestFeature.Messages,
					}),
				until: (row) => row.balance === 60,
				timeoutMs: 15_000,
				intervalMs: 250,
			});
		}

		for (const planId of [batchPlan.id, perCustomerPlan.id]) {
			await mintPlanVersion({ autumnV2_3, planId, items: planItemsV2() });
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
				remaining: 60,
				usage: 40,
				planId,
			});
			await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Dashboard,
			});
			expect(
				(await autumnV1.customers.get<ApiCustomerV3>(customerId)).features?.[
					TestFeature.Dashboard
				],
			).toBeDefined();
			await expectActivePlanVersion({ ctx, customerId, planId, version: 2 });
		}
	},
);
