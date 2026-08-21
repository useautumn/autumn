/**
 * A replace narrowed by interval/count must repoint only the matching
 * same-feature row and leave the sibling's definition and balance unchanged.
 */
import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
	entitlements,
	ResetInterval,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { ScenarioCtx } from "../batchTestUtils";

const readMessageRows = async ({
	ctx,
	customerId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
}) =>
	ctx.db
		.select({
			id: customerEntitlements.id,
			entitlementId: customerEntitlements.entitlement_id,
			balance: customerEntitlements.balance,
			intervalCount: entitlements.interval_count,
			resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
			nextResetAt: customerEntitlements.next_reset_at,
		})
		.from(customerEntitlements)
		.innerJoin(
			entitlements,
			eq(entitlements.id, customerEntitlements.entitlement_id),
		)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, customerEntitlements.customer_product_id),
		)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerProducts.internal_customer_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);

test(`${chalk.yellowBright("batch migration: replace narrows to one same-feature cadence")}`, async () => {
	const customerId = "batch-replace-interval-narrowing";
	const plan = products.base({
		id: "batch-replace-interval-plan",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			{
				...items.monthlyMessages({ includedUsage: 300 }),
				interval_count: 3,
			},
		],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const before = await readMessageRows({ ctx, customerId });
	const monthlyBefore = before.find((row) => row.intervalCount === 1);
	const quarterlyBefore = before.find((row) => row.intervalCount === 3);
	if (!monthlyBefore || !quarterlyBefore) {
		throw new Error("Expected monthly and quarterly message rows");
	}

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-interval-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [itemsV2.monthlyMessages({ included: 200 })],
						remove_items: [
							{
								feature_id: TestFeature.Messages,
								interval: ResetInterval.Month,
								interval_count: 1,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	const after = await readMessageRows({ ctx, customerId });
	const monthlyAfter = after.find((row) => row.intervalCount === 1);
	const quarterlyAfter = after.find((row) => row.intervalCount === 3);
	expect(monthlyAfter).toMatchObject({
		id: monthlyBefore.id,
		balance: 200,
	});
	expect(monthlyAfter?.entitlementId).not.toBe(monthlyBefore.entitlementId);
	expect(quarterlyAfter).toEqual(quarterlyBefore);
});
