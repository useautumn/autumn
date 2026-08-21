/**
 * Filter-mode delete matches live messages/mo rows by feature+interval, so a
 * free custom 500/mo is removed along with the catalog 100/mo copy.
 *
 * Paid different-allowance rows stay in batch-delete-item-paid-rows.test.ts.
 */
import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../batchTestUtils";
import {
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_ALLOWANCE = 500;

test.concurrent(
	`${chalk.yellowBright("batch plan-item delete: a delete removes free custom rows of every live allowance")}`,
	async () => {
		const catalogCustomerId = "bpid-del-filter-catalog";
		const sameMeaningCustomerId = "bpid-del-filter-same";
		const custom500CustomerId = "bpid-del-filter-500";
		const plan = products.base({
			id: "bpid-del-filter-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId: catalogCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([
					{ id: sameMeaningCustomerId },
					{ id: custom500CustomerId },
				]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: sameMeaningCustomerId,
						productId: plan.id,
					}),
					s.billing.attach({
						customerId: custom500CustomerId,
						productId: plan.id,
					}),
				),
			],
		});
		const planId = plan.id;

		await repointToCustomEntitlement({
			ctx,
			customerId: sameMeaningCustomerId,
			featureId: TestFeature.Messages,
		});
		await repointToCustomEntitlement({
			ctx,
			customerId: custom500CustomerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: CUSTOM_ALLOWANCE },
		});
		await setScopedFeatureBalance({
			ctx,
			customerId: custom500CustomerId,
			featureId: TestFeature.Messages,
			balance: CUSTOM_ALLOWANCE,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "bpid-delete-custom-migration",
			filter: { customer: { plan: { plan_id: planId, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planId, custom: false },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: ResetInterval.Month,
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		for (const customerId of [
			catalogCustomerId,
			sameMeaningCustomerId,
			custom500CustomerId,
		]) {
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId,
				featureId: TestFeature.Messages,
				count: 0,
			});
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId,
				featureId: TestFeature.Dashboard,
				count: 1,
			});
		}
	},
);
