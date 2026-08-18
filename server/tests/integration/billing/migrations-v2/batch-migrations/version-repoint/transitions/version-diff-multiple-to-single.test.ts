/**
 * Multiple→single same feature (allowed per decision 1): the strongest-
 * precision row pairs and keeps its own usage; the orphaned yearly sibling is
 * deleted and its usage drops with it.
 */
import { expect, test } from "bun:test";
import { EntInterval, ProductItemInterval } from "@autumn/shared";
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

test.concurrent(
	`${chalk.yellowBright("batch version repoint transitions: multiple to single same-feature rows drops the orphan")}`,
	async () => {
		const stem = `bvrt-fanin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				{
					...items.monthlyMessages({ includedUsage: 200 }),
					interval: ProductItemInterval.Year,
				},
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
			],
		});
		await mintPlanVersion({
			client: autumnV2_3,
			planId: plan.id,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const rowsBefore = await readFeatureRowsWithDefinition({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const monthlyBefore = rowsBefore.find(
			(row) => row.interval === EntInterval.Month,
		);
		const yearlyBefore = rowsBefore.find(
			(row) => row.interval === EntInterval.Year,
		);
		if (!monthlyBefore || !yearlyBefore) {
			throw new Error("Expected monthly and yearly message rows");
		}

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

		// Only the paired monthly row survives, carrying its own usage; the
		// yearly orphan is deleted and its usage drops (decision 1).
		const after = await readFeatureRowsWithDefinition({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(after).toHaveLength(1);
		expect(after[0]).toMatchObject({
			id: monthlyBefore.id,
			balance: monthlyBefore.balance,
			interval: EntInterval.Month,
			allowance: 100,
		});
		expect(after[0].entitlementId).not.toBe(monthlyBefore.entitlementId);
		expect(after[0].id).not.toBe(yearlyBefore.id);
	},
);
