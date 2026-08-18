/**
 * A remove filter narrowed by interval and interval_count must delete only the
 * matching same-feature row, even when that row has already been consumed.
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
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { ScenarioCtx } from "../batchTestUtils";

const MONTHLY_INCLUDED = 100;
const QUARTERLY_INCLUDED = 300;
const QUARTERLY_CONSUMED = 50;

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
			interval: entitlements.interval,
			intervalCount: entitlements.interval_count,
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

test(`${chalk.yellowBright("batch migration: interval narrowing deletes only the consumed matching sibling")}`, async () => {
	const customerId = "batch-delete-interval-narrowing";
	const quarterlyMessages = {
		...items.monthlyMessages({ includedUsage: QUARTERLY_INCLUDED }),
		interval_count: 3,
	};
	const plan = products.base({
		id: "batch-delete-interval-narrowing-plan",
		items: [
			items.monthlyMessages({ includedUsage: MONTHLY_INCLUDED }),
			quarterlyMessages,
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const rowsBefore = await readMessageRows({ ctx, customerId });
	expect(rowsBefore).toHaveLength(2);
	const monthlyBefore = rowsBefore.find((row) => row.intervalCount === 1);
	const quarterlyBefore = rowsBefore.find((row) => row.intervalCount === 3);
	expect(monthlyBefore).toBeDefined();
	expect(quarterlyBefore).toBeDefined();
	if (!monthlyBefore || !quarterlyBefore) {
		throw new Error("Expected monthly and quarterly message rows");
	}

	await ctx.db
		.update(customerEntitlements)
		.set({ balance: QUARTERLY_INCLUDED - QUARTERLY_CONSUMED })
		.where(eq(customerEntitlements.id, quarterlyBefore.id));

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-interval-narrowing-migration",
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
								interval_count: 3,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	const rowsAfter = await readMessageRows({ ctx, customerId });
	expect(rowsAfter).toHaveLength(1);
	expect(rowsAfter[0]).toMatchObject({
		id: monthlyBefore.id,
		entitlementId: monthlyBefore.entitlementId,
		balance: monthlyBefore.balance,
		interval: monthlyBefore.interval,
		intervalCount: 1,
	});
});
