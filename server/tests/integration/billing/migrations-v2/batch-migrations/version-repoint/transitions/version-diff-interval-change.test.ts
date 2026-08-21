/**
 * Interval change across versions (free items, both directions): definition
 * swaps, usage carries, and next_reset_at matches the batch replace-item
 * behavior — the live row's anchor is kept and the next reset is recomputed
 * from it at the target cadence.
 */
import { expect, test } from "bun:test";
import {
	EntInterval,
	getCycleEnd,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectVersionRepointedOnce,
	mintPlanVersion,
	readFeatureRowsWithDefinition,
} from "../utils/versionDiffTestUtils";
import {
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const yearlyMessagesItem = ({ includedUsage }: { includedUsage: number }) => ({
	...items.monthlyMessages({ includedUsage }),
	interval: ProductItemInterval.Year,
});

for (const scenario of [
	{
		name: "month to year",
		fromItem: items.monthlyMessages({ includedUsage: 100 }),
		toItem: {
			feature_id: TestFeature.Messages,
			included: 250,
			reset: { interval: ResetInterval.Year },
		},
		// 100 - 30 usage, then +150 allowance delta.
		expectedBalance: 220,
		expectedInterval: EntInterval.Year,
	},
	{
		name: "year to month",
		fromItem: yearlyMessagesItem({ includedUsage: 200 }),
		toItem: itemsV2.monthlyMessages({ included: 100 }),
		// 200 - 30 usage, then -100 allowance delta.
		expectedBalance: 70,
		expectedInterval: EntInterval.Month,
	},
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint transitions: interval change ${scenario.name}`)}`,
		async () => {
			const stem = `bvrt-interval-${scenario.name.replaceAll(" ", "-")}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
			const customerId = `${stem}-customer`;
			const plan = products.base({
				id: `${stem}-plan`,
				items: [scenario.fromItem],
			});
			const { ctx, autumnV2_3 } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [
					s.billing.attach({ productId: plan.id }),
					s.track({
						featureId: TestFeature.Messages,
						value: 30,
						timeout: 2_000,
					}),
				],
			});
			await mintPlanVersion({
				client: autumnV2_3,
				planId: plan.id,
				items: [scenario.toItem],
			});
			const before = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});
			const [rowBefore] = await readFeatureRowsWithDefinition({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, version: 1 },
							version: 2,
						},
					],
				},
			});

			await expectVersionRepointedOnce({
				ctx,
				customerId,
				planId: plan.id,
				before,
				targetVersion: 2,
				result,
			});

			const [rowAfter] = await readFeatureRowsWithDefinition({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			expect(rowAfter).toMatchObject({
				id: rowBefore.id,
				balance: scenario.expectedBalance,
				interval: scenario.expectedInterval,
			});
			expect(rowAfter.entitlementId).not.toBe(rowBefore.entitlementId);

			// Replace-item anchor behavior: the live row's anchor is kept and the
			// next reset is the first target-cadence boundary after it.
			expect(rowAfter.resetCycleAnchor).toBe(rowBefore.resetCycleAnchor);
			expect(rowAfter.nextResetAt).toBe(
				getCycleEnd({
					anchor: rowBefore.resetCycleAnchor as number,
					interval: scenario.expectedInterval,
					now: Date.now(),
				}),
			);
		},
	);
}
