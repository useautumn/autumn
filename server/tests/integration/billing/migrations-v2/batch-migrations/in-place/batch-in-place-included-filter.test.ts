/**
 * Dashboard catalogV2 existing-version draft: 100→200 must rewrite the
 * catalog grant and leave a customized 1k row alone.
 *
 * Contract (C2): catalog 100 → remaining 197 after consume 3; custom 1k
 * untouched (same entitlement id and balance). Draft remove_items carry
 * included: 100.
 *
 * Wildcard rewrite of 1k stays in batch-replace-item-custom-definitions.test.ts.
 */

import { expect, test } from "bun:test";
import { ResetInterval, type UpdateCatalogResponse } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import {
	expectFeatureRowUnchanged,
	expectReplacedFeatureRowCorrect,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_1K_ALLOWANCE = 1000;
const NEW_ALLOWANCE = 200;
const CONSUMED = 3;

test.concurrent(
	`${chalk.yellowBright("in-place catalog: 100→200 draft spares a custom 1k row")}`,
	async () => {
		const catalogCustomerId = "batch-inplace-included-catalog";
		const custom1kCustomerId = "batch-inplace-included-1k";
		const plan = products.base({
			id: "batch-inplace-included-plan",
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

		await repointToCustomEntitlement({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: CUSTOM_1K_ALLOWANCE },
		});
		await setScopedFeatureBalance({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			balance: CUSTOM_1K_ALLOWANCE,
		});

		const catalogBefore = await setScopedFeatureBalance({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
			balance: CATALOG_ALLOWANCE - CONSUMED,
		});
		const custom1kBefore = await setScopedFeatureBalance({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			balance: CUSTOM_1K_ALLOWANCE,
		});

		const response = (await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: plan.id,
					migration: { draft: true },
					items: [
						itemsV2.dashboard(),
						itemsV2.monthlyMessages({ included: NEW_ALLOWANCE }),
					],
				},
			],
		})) as UpdateCatalogResponse;
		const migrationId = response.migrations?.[0]?.id;
		expect(migrationId).toBeDefined();

		const [migration] = await migrationRepo.get({ ctx, id: migrationId });
		expect(migration).toBeDefined();
		const updatePlan = migration!.operations?.customer?.find(
			(operation) => operation.type === "update_plan",
		);
		expect(updatePlan?.customize?.remove_items).toEqual([
			{
				feature_id: TestFeature.Messages,
				interval: ResetInterval.Month,
				interval_count: 1,
				included: CATALOG_ALLOWANCE,
			},
		]);

		const migrationRunId = generateId("mrun");
		const result = await runMigrationInChunks({
			ctx,
			migration: migration!,
			migrationRunId,
			dryRun: false,
		});
		expectBatchLane({ result });

		await expectReplacedFeatureRowCorrect({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: catalogBefore.id,
			beforeEntitlementId: catalogBefore.entitlement_id,
			balance: NEW_ALLOWANCE - CONSUMED,
		});
		await expectFeatureRowUnchanged({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: custom1kBefore.id,
			beforeEntitlementId: custom1kBefore.entitlement_id,
			balance: CUSTOM_1K_ALLOWANCE,
		});
		await expectBalanceCorrect({
			customerId: custom1kCustomerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: CUSTOM_1K_ALLOWANCE,
			remaining: CUSTOM_1K_ALLOWANCE,
			usage: 0,
			planId: plan.id,
			breakdownCount: 1,
		});
	},
);
