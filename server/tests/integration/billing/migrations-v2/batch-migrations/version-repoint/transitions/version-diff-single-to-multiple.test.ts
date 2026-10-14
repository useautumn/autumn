import { expect, test } from "bun:test";
import { EntInterval, ResetInterval } from "@autumn/shared";
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

test.skip(
	`${chalk.yellowBright("batch version repoint transitions: single to multiple same-feature rows")}`,
	async () => {
		const stem = `bvrt-fanout-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
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
			items: [
				itemsV2.monthlyMessages({ included: 150 }),
				{
					feature_id: TestFeature.Messages,
					included: 200,
					reset: { interval: ResetInterval.Year },
				},
			],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const [monthlyBefore] = await readFeatureRowsWithDefinition({
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

		const after = await readFeatureRowsWithDefinition({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(after).toHaveLength(2);
		const monthlyAfter = after.find(
			(row) => row.interval === EntInterval.Month,
		);
		const yearlyAfter = after.find((row) => row.interval === EntInterval.Year);

		expect(monthlyAfter).toMatchObject({
			id: monthlyBefore.id,
			balance: 120,
			allowance: 150,
		});
		expect(monthlyAfter?.entitlementId).not.toBe(monthlyBefore.entitlementId);

		expect(yearlyAfter).toMatchObject({ balance: 200, allowance: 200 });
		expect(yearlyAfter?.id).not.toBe(monthlyBefore.id);
	},
);
