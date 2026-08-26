/**
 * Batch never re-anchors billing: a version-only replace must keep the row's
 * live reset cycle exactly (no mid-cycle reset), while the definition swaps.
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
import { getCustomerEntitlementCycle } from "../../batchTestUtils";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import { uniqueStem } from "../parity/versionParityTestUtils";
import {
	expectBatchLane,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const DAY_MS = 24 * 60 * 60 * 1_000;

test.skip(
	`${chalk.yellowBright("batch version repoint anchors: replaced entitlement keeps next_reset_at")}`,
	async () => {
		const stem = uniqueStem("bvr-anchor-keep");
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
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2_000 }),
			],
		});
		const before = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		// A mid-cycle anchor makes "kept" distinguishable from "recomputed at now".
		const resetCycleAnchor = Date.now() - 5 * DAY_MS;
		const nextResetAt = getCycleEnd({
			anchor: resetCycleAnchor,
			interval: EntInterval.Month,
			intervalCount: 1,
			now: Date.now(),
		});
		await ctx.db
			.update(customerEntitlements)
			.set({ reset_cycle_anchor: resetCycleAnchor, next_reset_at: nextResetAt })
			.where(eq(customerEntitlements.id, before.id));

		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
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

		const after = await getCustomerEntitlementCycle({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(after.resetCycleAnchor).toBe(resetCycleAnchor);
		expect(after.nextResetAt).toBe(nextResetAt);
		expect(after.balance).toBe(170);
	},
);
