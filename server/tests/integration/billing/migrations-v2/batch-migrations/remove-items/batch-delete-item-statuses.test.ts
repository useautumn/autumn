/**
 * Operation scope includes scheduled, paused, and past-due products while
 * expired products remain historical and untouched.
 */
import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerEntitlements,
	customerProducts,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { readScopedFeatureRow } from "../paidRowTestUtils";

test(`${chalk.yellowBright("batch migration: delete respects migratable product statuses")}`, async () => {
	const scheduledId = "batch-delete-status-scheduled";
	const pausedId = "batch-delete-status-paused";
	const pastDueId = "batch-delete-status-past-due";
	const expiredId = "batch-delete-status-expired";
	const plan = products.base({
		id: "batch-delete-status-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId: scheduledId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([
				{ id: pausedId },
				{ id: pastDueId },
				{ id: expiredId },
			]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: plan.id }),
				s.attach({ customerId: pausedId, productId: plan.id }),
				s.attach({ customerId: pastDueId, productId: plan.id }),
				s.attach({ customerId: expiredId, productId: plan.id }),
			),
		],
	});

	const statusCases = [
		[scheduledId, CusProductStatus.Scheduled],
		[pausedId, CusProductStatus.Paused],
		[pastDueId, CusProductStatus.PastDue],
		[expiredId, CusProductStatus.Expired],
	] as const;
	const rowsByStatus = await Promise.all(
		statusCases.map(async ([customerId, status]) => {
			const row = await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			if (!row.customer_product_id) {
				throw new Error(`Expected a customer product for ${customerId}`);
			}
			await ctx.db
				.update(customerProducts)
				.set({ status })
				.where(eq(customerProducts.id, row.customer_product_id));
			return { customerId, status, customerEntitlementId: row.id };
		}),
	);

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-status-migration",
		filter: {
			customer: {
				customer_id: {
					$in: [scheduledId, pausedId, pastDueId, expiredId],
				},
			},
		},
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

	expect(result?.lane).toBe("batch");
	const surviving = await ctx.db
		.select({
			id: customerEntitlements.id,
			status: customerProducts.status,
		})
		.from(customerEntitlements)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, customerEntitlements.customer_product_id),
		)
		.where(
			inArray(
				customerEntitlements.id,
				rowsByStatus.map((row) => row.customerEntitlementId),
			),
		);
	expect(surviving).toEqual([
		{
			id: rowsByStatus[3].customerEntitlementId,
			status: CusProductStatus.Expired,
		},
	]);
});
