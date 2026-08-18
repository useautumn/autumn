/**
 * A trialing row repoints without touching trial_ends_at while the target
 * version's allowance still lands on the balance.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import { uniqueStem } from "../parity/versionParityTestUtils";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch version repoint anchors: trial row keeps trial_ends_at and swaps balances")}`,
	async () => {
		const stem = uniqueStem("bvr-anchor-trial");
		const customerId = `${stem}-customer`;
		const plan = products.baseWithTrial({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
			cardRequired: false,
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({ featureId: TestFeature.Messages, value: 20, timeout: 2_000 }),
			],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(before.trialEndsAt).not.toBeNull();

		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 250 })],
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
		expectBatchLane({ result });

		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expectCustomerPlanRepointedInPlace({ before, after, targetVersion: 2 });
		expect(after.trialEndsAt).toBe(before.trialEndsAt);

		const entitlement = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(entitlement.balance).toBe(230);
	},
);
