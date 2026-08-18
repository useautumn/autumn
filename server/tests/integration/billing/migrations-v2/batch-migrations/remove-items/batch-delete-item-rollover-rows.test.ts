/**
 * Accrued rollover rows must survive a delete even when the catalog item no
 * longer declares rollover.
 *
 * The compute guard reads `entitlement.rollover` from the catalog, but
 * rollover rows are accumulated DB state: turning the flag off leaves the
 * balances behind, and rollover_cus_ent_id_fkey cascades. The executor
 * therefore checks the rows, not just the flag.
 *
 * Red (flag-only guard): the row is deleted and its rollover cascades away.
 * Green: the row survives and the customer falls out of the batch's changes.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, rollovers } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";

const MESSAGES_INCLUDED = 100;
const ROLLOVER_BALANCE = 25;

test(`${chalk.yellowBright("batch migration: a delete spares rows carrying accrued rollover")}`, async () => {
	const customerId = "batch-delete-rollover-rows";
	const plan = products.base({
		id: "batch-delete-rollover-plan",
		items: [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const messageRows = await ctx.db
		.select({ id: customerEntitlements.id })
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_id, customerId),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);
	expect(messageRows).toHaveLength(1);
	const customerEntitlementId = messageRows[0].id;

	// The catalog item never declared rollover, so only the row-level check
	// can see this. That is exactly the case the flag-only guard misses.
	await ctx.db.insert(rollovers).values({
		id: generateId("ro"),
		cus_ent_id: customerEntitlementId,
		balance: ROLLOVER_BALANCE,
		expires_at: null,
		usage: 0,
		entities: {},
	});

	await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-rollover-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	// ── The row and its rollover both survive ──────────────────────────
	const survivingRows = await ctx.db
		.select({ id: customerEntitlements.id })
		.from(customerEntitlements)
		.where(eq(customerEntitlements.id, customerEntitlementId));
	expect(survivingRows).toHaveLength(1);

	const survivingRollovers = await ctx.db
		.select({ balance: rollovers.balance })
		.from(rollovers)
		.where(inArray(rollovers.cus_ent_id, [customerEntitlementId]));
	expect(survivingRollovers).toHaveLength(1);
	expect(survivingRollovers[0].balance).toBe(ROLLOVER_BALANCE);
});
