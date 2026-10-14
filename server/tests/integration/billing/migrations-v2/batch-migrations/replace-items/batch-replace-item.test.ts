import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
	type ScenarioCtx,
} from "../batchTestUtils";

const MESSAGES_INCLUDED = 100;
const NEW_MESSAGES_INCLUDED = 200;
const CONSUMED = 60;

const readMessagesRow = async ({
	ctx,
	customerId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
}) => {
	const [row] = await ctx.db
		.select({
			id: customerEntitlements.id,
			entitlementId: customerEntitlements.entitlement_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.innerJoin(
			customerProducts,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);
	if (!row) throw new Error(`Expected a messages row for ${customerId}`);
	return row;
};

test(`${chalk.yellowBright("batch migration: editing a free plan item batch-lowers and carries the balance")}`, async () => {
	const customerId = "batch-plan-item-replace-customer";
	const plan = products.base({
		id: "batch-plan-item-replace-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const beforeRow = await readMessagesRow({ ctx, customerId });
	await ctx.db
		.update(customerEntitlements)
		.set({ balance: MESSAGES_INCLUDED - CONSUMED })
		.where(eq(customerEntitlements.id, beforeRow.id));

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-plan-item-replace-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						add_items: [
							itemsV2.monthlyMessages({ included: NEW_MESSAGES_INCLUDED }),
						],
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
	});

	await pollUntil({
		fetch: () => readMessagesRow({ ctx, customerId }),
		until: (row) =>
			row.balance === NEW_MESSAGES_INCLUDED - CONSUMED &&
			row.entitlementId !== beforeRow.entitlementId,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	const afterRow = await readMessagesRow({ ctx, customerId });
	expect(afterRow.id).toBe(beforeRow.id);
	expect(afterRow.balance).toBe(NEW_MESSAGES_INCLUDED - CONSUMED);

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 1,
	});

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Dashboard,
		count: 1,
	});
});
