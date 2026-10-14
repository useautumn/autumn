import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import {
	findResetEligibleRow,
	runResetOnCustomerEntitlement,
} from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

import { eq } from "drizzle-orm";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import { uniqueStem } from "../parity/versionParityTestUtils";
import {
	expectBatchLane,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

test.skip(`${chalk.yellowBright("batch version repoint anchors: reset at the boundary fires once with the new allowance")}`, async () => {
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

	expect(
		await findResetEligibleRow({
			ctx,
			customerEntitlementId: migrated.id,
			dueBefore: now,
		}),
		"repointed cusEnt should be selected by the reset cron scan",
	).not.toBeNull();
	await runResetOnCustomerEntitlement({
		ctx,
		customerId,
		customerEntitlementId: migrated.id,
	});

	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.balance).toBe(250);
	expect(after.next_reset_at).toBeGreaterThan(now);

	expect(
		await findResetEligibleRow({
			ctx,
			customerEntitlementId: migrated.id,
			dueBefore: now,
		}),
	).toBeNull();
});
