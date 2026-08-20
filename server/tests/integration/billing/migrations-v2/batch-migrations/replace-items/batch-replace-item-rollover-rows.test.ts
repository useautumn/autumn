/**
 * Replace repoints the existing customer-entitlement row, so accrued rollover
 * rows must stay attached and retain their balances.
 */
import { expect, test } from "bun:test";
import { rollovers } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const FROM_ALLOWANCE = 100;
const TO_ALLOWANCE = 200;
const ROLLOVER_BALANCE = 25;

test(`${chalk.yellowBright("batch migration: replace preserves accrued rollover rows")}`, async () => {
	const customerId = "batch-replace-rollover-rows";
	const plan = products.base({
		id: "batch-replace-rollover-plan",
		items: [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: FROM_ALLOWANCE }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	const rolloverId = generateId("ro");
	await ctx.db.insert(rollovers).values({
		id: rolloverId,
		cus_ent_id: before.id,
		balance: ROLLOVER_BALANCE,
		expires_at: null,
		usage: 0,
		entities: {},
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-rollover-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [itemsV2.monthlyMessages({ included: TO_ALLOWANCE })],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.id).toBe(before.id);
	expect(after.entitlement_id).not.toBe(before.entitlement_id);

	const [rolloverAfter] = await ctx.db
		.select({
			id: rollovers.id,
			customerEntitlementId: rollovers.cus_ent_id,
			balance: rollovers.balance,
		})
		.from(rollovers)
		.where(eq(rollovers.id, rolloverId));
	expect(rolloverAfter).toEqual({
		id: rolloverId,
		customerEntitlementId: before.id,
		balance: ROLLOVER_BALANCE,
	});
});
