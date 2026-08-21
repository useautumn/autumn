/**
 * Repoint right at a reset boundary: after migrating to v2 the overdue reset
 * fires exactly once and grants the NEW allowance — never twice, never the old
 * amount. Boundary crossing is driven the same way the reset-cron integration
 * tests do it (backdate next_reset_at, run resetCustomerEntitlement) — a
 * Stripe test clock is unnecessary since these plans are free and DB-only.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, type ResetCusEnt } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { eq } from "drizzle-orm";
import { resetCustomerEntitlement } from "@/cron/resetCron/resetCustomerEntitlement";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import { uniqueStem } from "../parity/versionParityTestUtils";
import {
	expectBatchLane,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

test.skip(
	`${chalk.yellowBright("batch version repoint anchors: reset at the boundary fires once with the new allowance")}`,
	async () => {
		const stem = uniqueStem("bvr-anchor-boundary");
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

		const migrated = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const now = Date.now();
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: now - 1_000 })
			.where(eq(customerEntitlements.id, migrated.id));

		const dueCusEnts = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: now,
		});
		const cronCusEnt = dueCusEnts.find((cusEnt) => cusEnt.id === migrated.id);
		expect(
			cronCusEnt,
			"repointed cusEnt should be selected by the reset cron loader",
		).toBeDefined();
		await resetCustomerEntitlement({
			ctx,
			cusEnt: cronCusEnt as ResetCusEnt,
			updatedCusEnts: [],
		});

		const after = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		// Exactly 250 = one grant of the v2 allowance; a double reset or a
		// stale v1 definition would land elsewhere.
		expect(after.balance).toBe(250);
		expect(after.next_reset_at).toBeGreaterThan(now);

		const dueAgain = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: now,
		});
		expect(dueAgain.map((cusEnt) => cusEnt.id)).not.toContain(migrated.id);
	},
);
