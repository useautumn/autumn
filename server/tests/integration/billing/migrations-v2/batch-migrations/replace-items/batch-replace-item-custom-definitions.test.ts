/**
 * Filter-mode replace rewrites free custom definitions of the matched
 * feature+interval, including a 1k allowance that used to be left untouched.
 *
 * Contract (C3): catalog 100 and free-custom 1k both replace to 30 in place.
 * Grouping: two custom 100/mo defs with different ids share one grant Δ
 * (increment:-70, remaining 100→30) — `customerEntitlementPatchKey`, not
 * entitlement_id. Unit test also covers increment:20 for 10→30.
 * Paid different-allowance rows stay in batch-replace-item-paid-rows.test.ts.
 */
import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "@tests/integration/billing/migrations-v2/utils/expectMigrationItemEvent";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectReplacedFeatureRowCorrect,
	readScopedFeatureRow,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_1K_ALLOWANCE = 1000;
const REPLACEMENT_ALLOWANCE = 30;
const GRANT_DELTA = REPLACEMENT_ALLOWANCE - CATALOG_ALLOWANCE;

test.concurrent(
	`${chalk.yellowBright("batch replace_item: free custom 1k rewrites to the minted definition")}`,
	async () => {
		const catalogCustomerId = "batch-replace-item-custom-catalog";
		const custom1kCustomerId = "batch-replace-item-custom-1k";
		const plan = products.base({
			id: "batch-replace-item-custom-plan",
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

		const catalogBefore = await readScopedFeatureRow({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
		});
		const custom1kBefore = await readScopedFeatureRow({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-item-custom-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							add_items: [
								itemsV2.monthlyMessages({
									included: REPLACEMENT_ALLOWANCE,
								}),
							],
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

		await expectReplacedFeatureRowCorrect({
			ctx,
			customerId: catalogCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: catalogBefore.id,
			beforeEntitlementId: catalogBefore.entitlement_id,
			balance: REPLACEMENT_ALLOWANCE,
		});
		await expectReplacedFeatureRowCorrect({
			ctx,
			customerId: custom1kCustomerId,
			featureId: TestFeature.Messages,
			beforeRowId: custom1kBefore.id,
			beforeEntitlementId: custom1kBefore.entitlement_id,
			balance: REPLACEMENT_ALLOWANCE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch replace: two custom 100/mo defs share one grant delta despite different ids")}`,
	async () => {
		const customerA = "batch-replace-group-a";
		const customerB = "batch-replace-group-b";
		const plan = products.base({
			id: "batch-replace-group-plan",
			items: [
				items.dashboard(),
				items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE }),
			],
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId: customerA,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: customerB }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customerB,
						productId: plan.id,
					}),
				),
			],
		});

		await repointToCustomEntitlement({
			ctx,
			customerId: customerA,
			featureId: TestFeature.Messages,
		});
		await repointToCustomEntitlement({
			ctx,
			customerId: customerB,
			featureId: TestFeature.Messages,
		});

		const beforeRows = await Promise.all(
			[customerA, customerB].map((customerId) =>
				setScopedFeatureBalance({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
					balance: CATALOG_ALLOWANCE,
				}),
			),
		);
		expect(beforeRows[0].entitlement_id).not.toBe(beforeRows[1].entitlement_id);
		expect(beforeRows[0].balance).toBe(CATALOG_ALLOWANCE);
		expect(beforeRows[1].balance).toBe(CATALOG_ALLOWANCE);

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-replace-group-migration",
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							add_items: [
								itemsV2.monthlyMessages({
									included: REPLACEMENT_ALLOWANCE,
								}),
							],
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

		const events = await getMigrationItemEvents({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			expectedCount: 2,
		});

		for (const [index, customerId] of [customerA, customerB].entries()) {
			await expectReplacedFeatureRowCorrect({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
				beforeRowId: beforeRows[index].id,
				beforeEntitlementId: beforeRows[index].entitlement_id,
				balance: beforeRows[index].balance + GRANT_DELTA,
			});
			if (!events) continue;
			await expectMigrationItemEventCorrect({
				ctx,
				events,
				customerId,
				status: "succeeded",
				itemChanges: [
					{
						action: "deleted",
						featureId: TestFeature.Messages,
						included: CATALOG_ALLOWANCE,
					},
					{
						action: "created",
						featureId: TestFeature.Messages,
						included: REPLACEMENT_ALLOWANCE,
					},
				],
			});
		}

		const afterIds = await Promise.all(
			[customerA, customerB].map(async (customerId) => {
				const after = await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				});
				return after.entitlement_id;
			}),
		);
		expect(afterIds[0]).toBe(afterIds[1]);
	},
);
