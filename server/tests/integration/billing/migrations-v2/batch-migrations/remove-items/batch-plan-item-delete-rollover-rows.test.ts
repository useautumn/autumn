import { expect, test } from "bun:test";
import { customerEntitlements, ResetInterval, rollovers } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";

const MESSAGES_INCLUDED = 100;
const ROLLOVER_BALANCE = 25;

test(`${chalk.yellowBright("batch plan-item delete: a delete spares rows carrying accrued rollover")}`, async () => {
	const customerId = "bpid-delete-rollover-rows";
	const plan = products.base({
		id: "bpid-delete-rollover-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
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
		migrationClient: autumnV2_3,
		migrationId: "bpid-delete-rollover-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [
							{
								feature_id: TestFeature.Messages,
								interval: ResetInterval.Month,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

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
