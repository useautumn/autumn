/**
 * Filter-mode replace with included: 100 rewrites catalog-shaped 100/mo
 * grants and leaves a customized 1k row alone.
 *
 * Contract:
 *   B2 catalog 100 + custom 1k — 100→200 with live Δ; 1k untouched
 *   B5 two custom 100s (different ids) + 1k — both 100s rewrite; 1k spared
 *   B6 replay B2 — no extra credits; 1k still 1k
 *   unmatched replace + leftover adds: 1k monthly spared; dashboard + lifetime land
 *
 * Wildcard (omit included) stays in batch-replace-item-custom-definitions.test.ts.
 * Paid skip stays in batch-replace-item-paid-rows.test.ts.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	expectUnmatchedReplaceLeftoversCorrect,
	unmatchedReplaceLeftoverCustomize,
} from "@tests/integration/billing/migrations-v2/utils/expectUnmatchedReplaceLeftoversCorrect";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectFeatureRowUnchanged,
	expectReplacedFeatureRowCorrect,
	readScopedFeatureRow,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_1K_ALLOWANCE = 1000;
const REPLACEMENT_ALLOWANCE = 200;
const GRANT_DELTA = REPLACEMENT_ALLOWANCE - CATALOG_ALLOWANCE;
const CONSUMED = 3;

const includedCatalogRemove = {
	feature_id: TestFeature.Messages,
	interval: ResetInterval.Month,
	included: CATALOG_ALLOWANCE,
};

const replaceTo200 = {
	add_items: [itemsV2.monthlyMessages({ included: REPLACEMENT_ALLOWANCE })],
	remove_items: [includedCatalogRemove],
};

test.concurrent(
	`${chalk.yellowBright("batch replace: included 100 rewrites catalog 100 and spares custom 1k")}`,
	async () => {
		const catalogCustomerId = "batch-replace-included-catalog";
		const custom1kCustomerId = "batch-replace-included-1k";
		const plan = products.base({
			id: "batch-replace-included-plan",
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

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-included-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: replaceTo200,
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		await expectReplacedFeatureRowCorrect({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: catalogBefore.id,
			beforeEntitlementId: catalogBefore.entitlement_id,
			balance: catalogBefore.balance + GRANT_DELTA,
		});
		await expectFeatureRowUnchanged({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: custom1kBefore.id,
			beforeEntitlementId: custom1kBefore.entitlement_id,
			balance: CUSTOM_1K_ALLOWANCE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: included 100 rewrites two custom 100s and spares 1k")}`,
	async () => {
		const custom100A = "batch-replace-included-100-a";
		const custom100B = "batch-replace-included-100-b";
		const custom1kCustomerId = "batch-replace-included-100-1k";
		const plan = products.base({
			id: "batch-replace-included-group-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId: custom100A,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: custom100B }, { id: custom1kCustomerId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: custom100B,
						productId: plan.id,
					}),
					s.billing.attach({
						customerId: custom1kCustomerId,
						productId: plan.id,
					}),
				),
			],
		});

		await repointToCustomEntitlement({
			ctx,
			customerId: custom100A,
			featureId: TestFeature.Messages,
		});
		await repointToCustomEntitlement({
			ctx,
			customerId: custom100B,
			featureId: TestFeature.Messages,
		});
		await repointToCustomEntitlement({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: CUSTOM_1K_ALLOWANCE },
		});

		const [beforeA, beforeB, before1k] = await Promise.all([
			setScopedFeatureBalance({
				ctx,
				customerId: custom100A,
				featureId: TestFeature.Messages,
				balance: CATALOG_ALLOWANCE,
			}),
			setScopedFeatureBalance({
				ctx,
				customerId: custom100B,
				featureId: TestFeature.Messages,
				balance: CATALOG_ALLOWANCE,
			}),
			setScopedFeatureBalance({
				ctx,
				customerId: custom1kCustomerId,
				featureId: TestFeature.Messages,
				balance: CUSTOM_1K_ALLOWANCE,
			}),
		]);
		expect(beforeA.entitlement_id).not.toBe(beforeB.entitlement_id);

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-included-group-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: replaceTo200,
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		for (const [customerId, before] of [
			[custom100A, beforeA],
			[custom100B, beforeB],
		] as const) {
			await expectReplacedFeatureRowCorrect({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
				beforeRowId: before.id,
				beforeEntitlementId: before.entitlement_id,
				balance: CATALOG_ALLOWANCE + GRANT_DELTA,
			});
		}
		await expectFeatureRowUnchanged({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: before1k.id,
			beforeEntitlementId: before1k.entitlement_id,
			balance: CUSTOM_1K_ALLOWANCE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: replaying included 100 credits the catalog delta once")}`,
	async () => {
		const catalogCustomerId = "batch-replace-included-replay-catalog";
		const custom1kCustomerId = "batch-replace-included-replay-1k";
		const plan = products.base({
			id: "batch-replace-included-replay-plan",
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

		const runReplace = ({ migrationId }: { migrationId: string }) =>
			runChunkedMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId,
				filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
				operations: {
					customer: [
						{
							type: "update_plan" as const,
							plan_filter: { plan_id: plan.id, custom: false },
							customize: replaceTo200,
						},
					],
				},
				noBillingChanges: true,
			});

		const firstRun = await runReplace({
			migrationId: "batch-replace-included-replay-first",
		});
		expectBatchLane({ result: firstRun.result });

		const afterFirst = await readScopedFeatureRow({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
		});
		expect(afterFirst.balance).toBe(catalogBefore.balance + GRANT_DELTA);

		const replay = await runReplace({
			migrationId: "batch-replace-included-replay-second",
		});
		expectBatchLane({ result: replay.result });

		const afterReplay = await readScopedFeatureRow({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
		});
		expect(afterReplay.id).toBe(afterFirst.id);
		expect(afterReplay.balance).toBe(afterFirst.balance);

		await expectFeatureRowUnchanged({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: custom1kBefore.id,
			beforeEntitlementId: custom1kBefore.entitlement_id,
			balance: CUSTOM_1K_ALLOWANCE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: unmatched 100→200 still adds boolean and lifetime")}`,
	async () => {
		const custom1kCustomerId = "batch-replace-unmatched-leftover-1k";
		const plan = products.base({
			id: "batch-replace-unmatched-leftover-plan",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId: custom1kCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await repointToCustomEntitlement({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			overrides: { allowance: CUSTOM_1K_ALLOWANCE },
		});
		const beforeMonthly = await setScopedFeatureBalance({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			balance: CUSTOM_1K_ALLOWANCE,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-unmatched-leftover-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: unmatchedReplaceLeftoverCustomize(),
					},
				],
			},
			noBillingChanges: true,
		});
		expectBatchLane({ result });

		await expectUnmatchedReplaceLeftoversCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId: custom1kCustomerId,
			planId: plan.id,
			beforeMonthly,
		});
	},
);
