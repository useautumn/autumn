/**
 * Regression coverage for customer-scoped migration serialization.
 *
 * Pre-fix: two migration definitions can load the same customer snapshot and
 * each replace the same customer product, leaving duplicate active products
 * and duplicated balances.
 * Post-fix: live migrations serialize before loading customer state, so the
 * second definition observes the first definition's completed update.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CusProductStatus,
	customerProducts,
	customers,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";
import { preProcessMigration } from "@/internal/migrations/v2/run/preProcess/index.js";

const createDeferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((resolver) => {
		resolve = resolver;
	});

	return { promise, resolve };
};

const timeout = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

test.concurrent(
	`${chalk.yellowBright("migrations idempotency: different definitions cannot replace one customer from the same snapshot")}`,
	async () => {
		const customerId = "migration-cross-definition-idempotency";
		const plan = products.base({
			id: "migration-cross-definition-plan",
			items: [items.monthlyMessages({ includedUsage: 1_500 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV1.products.update(plan.id, {
			items: [items.monthlyMessages({ includedUsage: 1_800 })],
		});

		const prepareMigration = async ({
			migrationId,
		}: {
			migrationId: string;
		}) => {
			const migration = preProcessMigration(
				await autumnV2_2.migrationsV2.deleteAndCreate({
					id: migrationId,
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
				}),
			);
			const { preparedState } = await prepare({
				ctx,
				migration,
				dryRun: false,
			});

			return { ...migration, prepared_state: preparedState };
		};

		const firstMigration = await prepareMigration({
			migrationId: `${customerId}-first`,
		});
		const secondMigration = await prepareMigration({
			migrationId: `${customerId}-second`,
		});
		const firstContextLoaded = createDeferred<void>();
		const releaseFirstMigration = createDeferred<void>();
		const secondContextLoaded = createDeferred<void>();

		const firstResult = migrateCustomer({
			ctx,
			customerId,
			migration: firstMigration,
			hooks: {
				aroundMigrateCustomer: async ({ run }) => {
					firstContextLoaded.resolve(undefined);
					await releaseFirstMigration.promise;
					return run();
				},
			},
		});
		await firstContextLoaded.promise;

		const secondResult = migrateCustomer({
			ctx,
			customerId,
			migration: secondMigration,
			hooks: {
				aroundMigrateCustomer: ({ run }) => {
					secondContextLoaded.resolve(undefined);
					return run();
				},
			},
		});

		try {
			await Promise.race([secondContextLoaded.promise, timeout(250)]);
		} finally {
			releaseFirstMigration.resolve(undefined);
		}
		const [firstMigrationResult, secondMigrationResult] = await Promise.all([
			firstResult,
			secondResult,
		]);
		expect(firstMigrationResult.status).toBe("succeeded");
		expect(secondMigrationResult.status).toBe("skipped");

		const activeCustomerProducts = await ctx.db
			.select({ id: customerProducts.id })
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
					eq(customerProducts.product_id, plan.id),
					eq(customerProducts.status, CusProductStatus.Active),
				),
			);
		expect(activeCustomerProducts).toHaveLength(1);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 1_800,
			remaining: 1_800,
			usage: 0,
			planId: plan.id,
		});
	},
);
