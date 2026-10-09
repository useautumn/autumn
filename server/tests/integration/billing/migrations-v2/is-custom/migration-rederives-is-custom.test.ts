/** Both lanes clear a stale custom flag, flag a diverging plan, and re-derive converged customers. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CusProductStatus,
	customerProducts,
	customers,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import {
	getInternalCustomerId,
	type ScenarioCtx,
} from "../batch-migrations/batchTestUtils";
import { repointToCustomEntitlement } from "../batch-migrations/paidRowTestUtils";

type Lane = "batch" | "per_customer";

const LANES: Lane[] = ["batch", "per_customer"];

const readIsCustom = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	planId: string;
}) => {
	const [row] = await ctx.db
		.select({ isCustom: customerProducts.is_custom })
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerProducts.product_id, planId),
				eq(customerProducts.status, CusProductStatus.Active),
			),
		);
	if (!row) throw new Error(`Expected an active ${planId} for ${customerId}`);
	return row.isCustom;
};

const setupOnPlan = async ({
	id,
	catalogMessages,
}: {
	id: string;
	catalogMessages: number;
}) => {
	const plan = products.base({
		id: `${id}-plan`,
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: catalogMessages }),
		],
	});
	const { ctx, autumnV1, autumnV2_2 } = await initScenario({
		customerId: id,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	return { ctx, autumnV1, autumnV2_2, plan };
};

const migrateMessagesTo = async ({
	ctx,
	autumnV2_2,
	id,
	planId,
	included,
	lane,
}: Awaited<ReturnType<typeof setupOnPlan>> & {
	id: string;
	planId: string;
	included: number;
	lane: Lane;
}) => {
	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${id}-migration`,
		filter: { customer: { plan: { plan_id: planId } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: planId },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [itemsV2.monthlyMessages({ included })],
					},
				},
			],
		},
		noBillingChanges: true,
		// A run limit keeps the migration off the batch lane.
		...(lane === "per_customer" ? { controls: { limit: 10 } } : {}),
	});
	expect(result?.lane).toBe(lane);
};

for (const lane of LANES) {
	test.concurrent(
		`${chalk.yellowBright(`migration is_custom (${lane}): a stale custom flag clears once the plan matches its catalog`)}`,
		async () => {
			const id = `mig-is-custom-clear-${lane}`;
			const setup = await setupOnPlan({ id, catalogMessages: 200 });
			const { ctx, plan } = setup;

			// The customer drifted to 100 messages and was flagged custom for it.
			await repointToCustomEntitlement({
				ctx,
				customerId: id,
				featureId: TestFeature.Messages,
				overrides: { allowance: 100 },
			});
			await ctx.db
				.update(customerProducts)
				.set({ is_custom: true })
				.where(
					eq(
						customerProducts.internal_customer_id,
						await getInternalCustomerId({ ctx, customerId: id }),
					),
				);

			await migrateMessagesTo({
				...setup,
				id,
				planId: plan.id,
				included: 200,
				lane,
			});

			expect(await readIsCustom({ ctx, customerId: id, planId: plan.id })).toBe(
				false,
			);
		},
	);

	test.concurrent(
		`${chalk.yellowBright(`migration is_custom (${lane}): a plan left diverging from its catalog is flagged custom`)}`,
		async () => {
			const id = `mig-is-custom-flag-${lane}`;
			const setup = await setupOnPlan({ id, catalogMessages: 100 });
			const { ctx, plan } = setup;
			expect(await readIsCustom({ ctx, customerId: id, planId: plan.id })).toBe(
				false,
			);

			await migrateMessagesTo({
				...setup,
				id,
				planId: plan.id,
				included: 300,
				lane,
			});

			expect(await readIsCustom({ ctx, customerId: id, planId: plan.id })).toBe(
				true,
			);
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("migration is_custom (per_customer): a version bump spares a customized plan whose stored flag is stale")}`,
	async () => {
		const id = "mig-is-custom-stale-guard";
		const setup = await setupOnPlan({ id, catalogMessages: 100 });
		const { ctx, autumnV1, autumnV2_2, plan } = setup;

		// Customized to 500 messages, but the stored flag was never set.
		await repointToCustomEntitlement({
			ctx,
			customerId: id,
			featureId: TestFeature.Messages,
			overrides: { allowance: 500 },
		});
		expect(await readIsCustom({ ctx, customerId: id, planId: plan.id })).toBe(
			false,
		);

		await autumnV1.products.update(plan.id, {
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 200 })],
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${id}-migration`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						version: 2,
					},
				],
			},
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("per_customer");

		const customer = await autumnV1.customers.get<ApiCustomerV3>(id);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("migration is_custom (batch): an already-converged customer's stale flag is corrected")}`,
	async () => {
		const id = "mig-is-custom-converged";
		const { ctx, autumnV2_2, plan } = await setupOnPlan({
			id,
			catalogMessages: 200,
		});
		await ctx.db
			.update(customerProducts)
			.set({ is_custom: true })
			.where(
				eq(
					customerProducts.internal_customer_id,
					await getInternalCustomerId({ ctx, customerId: id }),
				),
			);

		// The customer already has the item, so the run skips them as converged.
		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${id}-migration`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");

		expect(await readIsCustom({ ctx, customerId: id, planId: plan.id })).toBe(
			false,
		);
	},
);
