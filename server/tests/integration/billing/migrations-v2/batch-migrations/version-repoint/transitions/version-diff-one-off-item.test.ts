/**
 * A free one-off (lifetime) item changing allowance across versions is
 * carried without reset scheduling: usage carries and next_reset_at stays
 * null.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
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
	`${chalk.yellowBright("batch version repoint transitions: lifetime free item carries without reset scheduling")}`,
	async () => {
		const stem = `bvrt-lifetime-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.lifetimeMessages({ includedUsage: 100 })],
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
		// No reset config on the v2 item: still a lifetime grant.
		await mintPlanVersion({
			client: autumnV2_3,
			planId: plan.id,
			items: [{ feature_id: TestFeature.Messages, included: 250 }],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const rowBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rowBefore.next_reset_at).toBeNull();

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

		const rowAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rowAfter.id).toBe(rowBefore.id);
		expect(rowAfter.entitlement_id).not.toBe(rowBefore.entitlement_id);
		// 100 - 30 usage, then +150 allowance delta; still no reset scheduled.
		expect(rowAfter.balance).toBe(220);
		expect(rowAfter.next_reset_at).toBeNull();
		expect(rowAfter.reset_cycle_anchor).toBeNull();
	},
);
