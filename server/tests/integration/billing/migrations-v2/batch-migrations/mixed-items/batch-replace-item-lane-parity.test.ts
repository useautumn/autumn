/**
 * Batch and per-customer replace use different write paths but must preserve
 * the same consumed usage and non-custom plan state.
 */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const replaceOperation = ({ planId }: { planId: string }) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, custom: false },
			customize: {
				add_items: [itemsV2.monthlyMessages({ included: 200 })],
				remove_items: [{ feature_id: TestFeature.Messages }],
			},
		},
	],
});

test(`${chalk.yellowBright("batch migration parity: replace matches the per-customer lane")}`, async () => {
	const batchCustomerId = "batch-replace-parity-batch";
	const perCustomerId = "batch-replace-parity-customer";
	const batchPlan = products.base({
		id: "batch-replace-parity-plan-a",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const perCustomerPlan = products.base({
		id: "batch-replace-parity-plan-b",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: batchCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: perCustomerId }]),
			s.products({ list: [batchPlan, perCustomerPlan] }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: batchPlan.id }),
				s.attach({
					customerId: perCustomerId,
					productId: perCustomerPlan.id,
				}),
			),
		],
	});

	for (const customerId of [batchCustomerId, perCustomerId]) {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});
		await pollUntil({
			fetch: () =>
				readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				}),
			until: (row) => row.balance === 40,
			timeoutMs: 15_000,
			intervalMs: 250,
		});
	}

	const batchRun = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-parity-batch-migration",
		filter: {
			customer: { plan: { plan_id: batchPlan.id, custom: false } },
		},
		operations: replaceOperation({ planId: batchPlan.id }),
		noBillingChanges: true,
	});
	expect(batchRun.result?.lane).toBe("batch");

	const perCustomerRun = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-parity-customer-migration",
		filter: {
			customer: { plan: { plan_id: perCustomerPlan.id, custom: false } },
		},
		operations: replaceOperation({ planId: perCustomerPlan.id }),
		noBillingChanges: true,
		controls: { only: [perCustomerId], limit: 1 },
	});
	expect(perCustomerRun.result?.lane).toBe("per_customer");

	for (const [customerId, planId] of [
		[batchCustomerId, batchPlan.id],
		[perCustomerId, perCustomerPlan.id],
	] as const) {
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 140,
			usage: 60,
			planId,
		});

		const rows = await ctx.db
			.select({ isCustom: customerProducts.is_custom })
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.product_id, planId),
					inArray(customerProducts.status, [
						CusProductStatus.Active,
						CusProductStatus.PastDue,
					]),
				),
			);
		expect(rows).toHaveLength(1);
		expect(rows[0].isCustom).toBe(false);
	}
});
