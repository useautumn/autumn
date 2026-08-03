/**
 * Lane parity: the same add_items migration run through the batch lane and
 * the per-customer lane must leave equivalent customer state.
 *
 * The lanes write different DB SHAPES by construction — per-customer
 * (computeCustomPlan) inserts a replacement customer product and expires the
 * old one, while the batch lane patches the existing row in place. This test
 * pins what must nevertheless match: the active plan, its items, and
 * crucially `is_custom` (a lane must never leave a customer looking
 * customized, or later `custom: false` migrations would silently skip them).
 *
 * Divergences it surfaces are recorded in
 * .plans/batch-migrations/webhooks-and-events.md.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CusProductStatus,
	customerProducts,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runChunkedMigration } from "../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "./batchTestUtils";

const addItems = [
	itemsV2.dashboard(),
	{ feature_id: TestFeature.Workflows, included: 10 },
];

const getActiveCustomerProducts = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
}) => {
	const rows = await ctx.db
		.select({
			id: customerProducts.id,
			status: customerProducts.status,
			is_custom: customerProducts.is_custom,
			internal_customer_id: customerProducts.internal_customer_id,
		})
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
	return rows;
};

test.concurrent(
	`${chalk.yellowBright("batch migration parity: batch lane matches per-customer lane state")}`,
	async () => {
		const batchCustomerId = "batch-parity-batch-lane";
		const perCustomerId = "batch-parity-per-customer";
		const batchPlan = products.base({ id: "batch-parity-plan-a", items: [] });
		const perCustomerPlan = products.base({
			id: "batch-parity-plan-b",
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: batchCustomerId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: perCustomerId }]),
				s.products({ list: [batchPlan, perCustomerPlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: batchPlan.id }),
					s.billing.attach({
						customerId: perCustomerId,
						productId: perCustomerPlan.id,
					}),
				),
			],
		});

		// Lane A: batch (plain run — batch-eligible).
		const batchRun = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-parity-batch-mig",
			filter: { customer: { plan: { plan_id: batchPlan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: batchPlan.id },
						customize: { add_items: addItems },
					},
				],
			},
			noBillingChanges: true,
		});
		expect(batchRun.result?.lane).toBe("batch");

		// Lane B: per-customer (`controls.limit` makes the run batch-ineligible;
		// `only` narrows scope without selecting the lane).
		const perCustomerRun = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-parity-per-customer-mig",
			filter: { customer: { plan: { plan_id: perCustomerPlan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: perCustomerPlan.id },
						customize: { add_items: addItems },
					},
				],
			},
			noBillingChanges: true,
			controls: { only: [perCustomerId], limit: 1 },
		});
		expect(perCustomerRun.result?.lane).toBe("per_customer");

		// ── Customer-visible state must match ──────────────────────────
		for (const [customerId, planId] of [
			[batchCustomerId, batchPlan.id],
			[perCustomerId, perCustomerPlan.id],
		] as const) {
			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectFlagCorrect({
				customer,
				featureId: TestFeature.Dashboard,
				planId,
			});
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Workflows,
				remaining: 10,
				usage: 0,
				planId,
			});
		}

		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: batchRun.migration.internal_id,
			migrationRunId: batchRun.migrationRunId,
			customerId: batchCustomerId,
			status: MigrationItemRunStatus.Succeeded,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: perCustomerRun.migration.internal_id,
			migrationRunId: perCustomerRun.migrationRunId,
			customerId: perCustomerId,
			status: MigrationItemRunStatus.Succeeded,
		});

		// ── The invariant that matters downstream: neither lane may leave the
		// customer product flagged custom, or later `custom: false` migrations
		// would silently skip these customers. ────────────────────────────
		const batchRows = await getActiveCustomerProducts({
			ctx,
			customerId: batchCustomerId,
			planId: batchPlan.id,
		});
		const perCustomerRows = await getActiveCustomerProducts({
			ctx,
			customerId: perCustomerId,
			planId: perCustomerPlan.id,
		});

		expect(batchRows).toHaveLength(1);
		expect(perCustomerRows).toHaveLength(1);
		expect(batchRows[0].is_custom).toBe(false);
		expect(perCustomerRows[0].is_custom).toBe(false);
	},
);
