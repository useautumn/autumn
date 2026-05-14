/**
 * TDD test for Phase 2 lazy migrations — concurrency safety.
 *
 * Contract under test:
 *   - Concurrent /customers.get requests for the same customer during an
 *     active lazy migration may enqueue multiple Trigger.dev tasks, but
 *     `migration_item_runs` claim machinery guarantees the migration runs
 *     exactly once for that customer.
 *   - The partial unique index on `migration_runs (migration_internal_id)
 *     WHERE status IN ('queued','running')` rejects a second `lazy_run`
 *     call for the SAME migration definition while one is already active.
 *   - Different migration definitions CAN have active lazy runs
 *     concurrently — correctness lives at the per-customer claim layer.
 */

import { expect, test } from "bun:test";
import { ErrCode, MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	buildDashboardLazyMigration,
	countCustomerItemRunRows,
	getCustomerAndAwaitMigration,
	getInternalCustomerId,
	releaseLazyMigrationRun,
	startLazyMigration,
	waitForCustomerItemRunStatus,
} from "./utils/lazyMigrationTestUtils.js";

test.concurrent(`${chalk.yellowBright("lazy migration concurrency: concurrent fetches execute migration exactly once")}`, async () => {
	const customerId = "lazy-concurrent-fetch";
	const plan = products.pro({ id: "lazy-concurrent-pro", items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const { migration, run_id } = await startLazyMigration({
		autumnV2_2,
		ctx,
		id: `${customerId}-mig`,
		planId: plan.id,
	});

	try {
		const concurrency = 10;
		await Promise.all(
			Array.from({ length: concurrency }, () =>
				autumnV2_2.customers.get(customerId),
			),
		);

		const internalCustomerId = await getInternalCustomerId({
			customerId,
			ctx,
		});
		await waitForCustomerItemRunStatus({
			ctx,
			migration,
			internalCustomerId,
			status: MigrationItemRunStatus.Succeeded,
		});

		const rowCount = await countCustomerItemRunRows({
			ctx,
			migration,
			internalCustomerId,
		});
		expect(rowCount).toBe(1);

		const migrated = await getCustomerAndAwaitMigration({
			autumnV2_2,
			customerId,
		});
		expect(migrated.flags[TestFeature.Dashboard]).toBeDefined();
	} finally {
		await releaseLazyMigrationRun({ ctx, runId: run_id });
	}
});

test.concurrent(`${chalk.yellowBright("lazy migration concurrency: starting a second lazy_run on the SAME migration is rejected (409)")}`, async () => {
	const customerId = "lazy-same-mig-rejected";
	const plan = products.pro({ id: "lazy-same-mig-pro", items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const { migration, run_id } = await startLazyMigration({
		autumnV2_2,
		ctx,
		id: `${customerId}-mig`,
		planId: plan.id,
	});

	try {
		// Same migration id → 409 (partial unique index on migration_internal_id).
		await expect(
			autumnV2_2.migrationsV2.lazyRun({ id: migration.id }),
		).rejects.toMatchObject({
			code: ErrCode.MigrationAlreadyInProgress,
			message: expect.stringContaining("already running"),
		});
	} finally {
		await releaseLazyMigrationRun({ ctx, runId: run_id });
	}
});

test.concurrent(`${chalk.yellowBright("lazy migration concurrency: two different migrations on the same customer can run concurrently")}`, async () => {
	const customerId = "lazy-two-migs";
	const plan = products.pro({ id: "lazy-two-migs-pro", items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const internalCustomerId = await getInternalCustomerId({ customerId, ctx });

	// First migration — adds Dashboard.
	const { migration: firstMigration, run_id: firstRunId } =
		await startLazyMigration({
			autumnV2_2,
			ctx,
			id: `${customerId}-first-mig`,
			planId: plan.id,
		});

	// Second migration — adds AdminRights. Starts WHILE first is still active.
	const secondMigrationDef = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-second-mig`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan" as const,
					plan_filter: { plan_id: plan.id },
					customize: {
						add_items: [{ feature_id: TestFeature.AdminRights }],
					},
				},
			],
		},
	});
	const secondRun = await autumnV2_2.migrationsV2.lazyRun({
		id: secondMigrationDef.id,
	});

	try {
		// Customer fetch eventually picks up BOTH migrations — poll in parallel
		// since each migration is independent and triggers its own task.
		await Promise.all([
			getCustomerAndAwaitMigration({
				autumnV2_2,
				customerId,
				featureId: TestFeature.Dashboard,
			}),
			getCustomerAndAwaitMigration({
				autumnV2_2,
				customerId,
				featureId: TestFeature.AdminRights,
			}),
		]);

		await Promise.all([
			waitForCustomerItemRunStatus({
				ctx,
				migration: firstMigration,
				internalCustomerId,
				status: MigrationItemRunStatus.Succeeded,
			}),
			waitForCustomerItemRunStatus({
				ctx,
				migration: secondMigrationDef,
				internalCustomerId,
				status: MigrationItemRunStatus.Succeeded,
			}),
		]);

		expect(
			await countCustomerItemRunRows({
				ctx,
				migration: firstMigration,
				internalCustomerId,
			}),
		).toBe(1);
		expect(
			await countCustomerItemRunRows({
				ctx,
				migration: secondMigrationDef,
				internalCustomerId,
			}),
		).toBe(1);
	} finally {
		await releaseLazyMigrationRun({ ctx, runId: firstRunId });
		await releaseLazyMigrationRun({ ctx, runId: secondRun.run_id });
	}
});
