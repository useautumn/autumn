/**
 * An entitlement ADDED by the target version must anchor its reset cycle to
 * the customer's existing anchor (sibling inheritance), not to `now` — the
 * same ladder the add-items suite pins (`cycleAnchorSql`), on the version path.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, EntInterval, getCycleEnd } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { eq } from "drizzle-orm";
import {
	expectCustomerEntitlementRowCount,
	getCustomerEntitlementCycle,
} from "../../batchTestUtils";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import { uniqueStem } from "../parity/versionParityTestUtils";
import {
	expectBatchLane,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const DAY_MS = 24 * 60 * 60 * 1_000;

test.skip(
	`${chalk.yellowBright("batch version repoint anchors: added entitlement adopts the customer's reset anchor, not now")}`,
	async () => {
		const stem = uniqueStem("bvr-anchor-add");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const sibling = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		// Backdated sibling anchor: next reset lands ~23d out, clearly ≠ now+1mo.
		const siblingAnchor = Date.now() - 7 * DAY_MS;
		const siblingNextResetAt = getCycleEnd({
			anchor: siblingAnchor,
			interval: EntInterval.Month,
			intervalCount: 1,
			now: Date.now(),
		});
		await ctx.db
			.update(customerEntitlements)
			.set({
				reset_cycle_anchor: siblingAnchor,
				next_reset_at: siblingNextResetAt,
			})
			.where(eq(customerEntitlements.id, sibling.id));

		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
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

		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Words,
			count: 1,
		});
		const addedCycle = await getCustomerEntitlementCycle({
			ctx,
			customerId,
			featureId: TestFeature.Words,
		});
		expect(addedCycle.resetCycleAnchor).toBe(siblingAnchor);
		expect(addedCycle.nextResetAt).toBe(siblingNextResetAt);
		expect(addedCycle.balance).toBe(50);

		const siblingCycle = await getCustomerEntitlementCycle({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(siblingCycle.resetCycleAnchor).toBe(siblingAnchor);
		expect(siblingCycle.nextResetAt).toBe(siblingNextResetAt);
	},
);
