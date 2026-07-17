/** Pre-fix, five definitions replace the same stale product into duplicates.
 * Post-fix, live migrations serialize and reload state while previews stay lock-free. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	CusProductStatus,
	customerProducts,
	customers,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { createProducts } from "@tests/utils/productUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
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
	`${chalk.yellowBright("migrations idempotency: five definitions cannot replace one customer from the same snapshot")}`,
	async () => {
		const customerId = "migration-cross-definition-idempotency";
		const plan = products.base({
			id: "migration-cross-definition-plan",
			items: [items.monthlyMessages({ includedUsage: 1_500 })],
		});

		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});
		const autumnV2_2 = new AutumnInt({
			version: ApiVersion.V2_2,
			secretKey: ctx.orgSecretKey,
		});

		try {
			await autumnV1.customers.delete(customerId);
		} catch {}
		await createProducts({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			autumn: autumnV1,
			products: [plan],
			createInStripe: false,
		});
		await autumnV1.customers.create({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			skipWebhooks: true,
			internalOptions: { disable_defaults: true },
		});
		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: plan.id,
				no_billing_changes: true,
			},
			{ timeout: 0, skipWebhooks: true },
		);

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
								customize: { add_items: [itemsV2.dashboard()] },
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

		const migrations: Awaited<ReturnType<typeof prepareMigration>>[] = [];
		for (let index = 0; index < 5; index++) {
			migrations.push(
				await prepareMigration({
					migrationId: `${customerId}-${index + 1}`,
				}),
			);
		}
		const [firstMigration, ...followerMigrations] = migrations;
		const firstContextLoaded = createDeferred<void>();
		const followerContextLoaded = createDeferred<void>();
		const releaseMigrations = createDeferred<void>();

		const firstResult = migrateCustomer({
			ctx,
			customerId,
			migration: firstMigration,
			hooks: {
				aroundMigrateCustomer: async ({ run }) => {
					firstContextLoaded.resolve(undefined);
					await releaseMigrations.promise;
					return run();
				},
			},
		});
		await firstContextLoaded.promise;

		const followerResults = followerMigrations.map((migration) =>
			migrateCustomer({
				ctx,
				customerId,
				migration,
				hooks: {
					aroundMigrateCustomer: async ({ run }) => {
						followerContextLoaded.resolve(undefined);
						await releaseMigrations.promise;
						return run();
					},
				},
			}),
		);
		const migrationResults = [firstResult, ...followerResults];
		const previewResult = migrateCustomer({
			ctx,
			customerId,
			migration: firstMigration,
			preview: true,
		});
		const previewOutcomeBeforeRelease = await Promise.race([
			previewResult.then(
				() => "completed" as const,
				() => "failed" as const,
			),
			timeout(2_000).then(() => "timed_out" as const),
		]);

		try {
			await Promise.race([followerContextLoaded.promise, timeout(250)]);
		} finally {
			releaseMigrations.resolve(undefined);
		}

		const [firstMigrationResult, ...followerMigrationResults] =
			await Promise.all(migrationResults);
		expect(previewOutcomeBeforeRelease).toBe("completed");
		expect((await previewResult).status).toBe("succeeded");
		expect(firstMigrationResult.status).toBe("succeeded");
		expect(followerMigrationResults.map((result) => result.status)).toEqual([
			"skipped",
			"skipped",
			"skipped",
			"skipped",
		]);

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
			granted: 1_500,
			remaining: 1_500,
			usage: 0,
			planId: plan.id,
		});
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			present: true,
			planId: plan.id,
		});
	},
);
