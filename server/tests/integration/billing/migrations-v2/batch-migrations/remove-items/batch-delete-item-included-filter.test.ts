/**
 * Filter-mode delete with included: 100 drops catalog-shaped 100/mo rows
 * and leaves a customized 1k grant.
 *
 * Contract (B3): catalog 100 gone; 1k remains. Dashboard survives.
 *
 * Wildcard (every live allowance) stays in batch-delete-item-custom-rows.test.ts.
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
	expectFeatureRowUnchanged,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_1K_ALLOWANCE = 1000;

test.concurrent(
	`${chalk.yellowBright("batch delete: included 100 drops catalog 100 and spares custom 1k")}`,
	async () => {
		const catalogCustomerId = "batch-del-included-catalog";
		const custom1kCustomerId = "batch-del-included-1k";
		const plan = products.base({
			id: "batch-del-included-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId: catalogCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: custom1kCustomerId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: custom1kCustomerId,
						productId: plan.id,
					}),
				),
			],
		});
		const planId = plan.id;

		await repointToCustomEntitlement({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: CUSTOM_1K_ALLOWANCE },
		});
		const custom1kBefore = await setScopedFeatureBalance({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			balance: CUSTOM_1K_ALLOWANCE,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-del-included-migration",
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
									included: CATALOG_ALLOWANCE,
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		await expectCustomerEntitlementRowCount({
			ctx,
			customerId: catalogCustomerId,
			planId,
			featureId: TestFeature.Messages,
			count: 0,
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId: catalogCustomerId,
			planId,
			featureId: TestFeature.Dashboard,
			count: 1,
		});
		await expectFeatureRowUnchanged({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: custom1kBefore.id,
			beforeEntitlementId: custom1kBefore.entitlement_id,
			balance: CUSTOM_1K_ALLOWANCE,
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId: custom1kCustomerId,
			planId,
			featureId: TestFeature.Dashboard,
			count: 1,
		});
	},
);
