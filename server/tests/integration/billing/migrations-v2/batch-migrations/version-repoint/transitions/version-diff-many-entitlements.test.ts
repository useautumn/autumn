/**
 * One version-only diff carrying five kinds of change at once: two
 * allowance-replaced items, one added, one removed, two identical-repointed.
 * Every row must land in a single pass.
 */
import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectVersionRepointedOnce,
	mintPlanVersion,
} from "../utils/versionDiffTestUtils";
import {
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

test.skip(
	`${chalk.yellowBright("batch version repoint transitions: many entitlements land in one pass")}`,
	async () => {
		const stem = `bvrt-many-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 50 }),
				items.monthlyCredits({ includedUsage: 40 }),
				items.dashboard(),
				items.free({ featureId: TestFeature.Storage, includedUsage: 25 }),
			],
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
				s.track({ featureId: TestFeature.Words, value: 10, timeout: 2_000 }),
			],
		});
		// v2: Messages/Words replaced, Credits/Dashboard identical,
		// Storage removed, Action2 added.
		await mintPlanVersion({
			client: autumnV2_3,
			planId: plan.id,
			items: [
				itemsV2.monthlyMessages({ included: 150 }),
				itemsV2.monthlyWords({ included: 80 }),
				itemsV2.monthlyCredits({ included: 40 }),
				itemsV2.dashboard(),
				{
					feature_id: TestFeature.Action2,
					included: 60,
					reset: { interval: ResetInterval.Month },
				},
			],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const creditsBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		const dashboardBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Dashboard,
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

		// Replaced rows: new allowance minus the usage already consumed.
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				})
			).balance,
		).toBe(120);
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Words,
				})
			).balance,
		).toBe(70);

		// Identical rows: claims move to the target's rows, state untouched.
		const creditsAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(creditsAfter.id).toBe(creditsBefore.id);
		expect(creditsAfter.entitlement_id).not.toBe(creditsBefore.entitlement_id);
		expect(creditsAfter.balance).toBe(40);
		const dashboardAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Dashboard,
		});
		expect(dashboardAfter.id).toBe(dashboardBefore.id);
		expect(dashboardAfter.entitlement_id).not.toBe(
			dashboardBefore.entitlement_id,
		);

		// Removed feature is gone; added feature exists with a full allowance.
		await expect(
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Storage,
			}),
		).rejects.toThrow();
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Action2,
				})
			).balance,
		).toBe(60);
	},
);
