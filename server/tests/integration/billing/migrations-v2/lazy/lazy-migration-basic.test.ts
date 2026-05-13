/**
 * TDD test for Phase 2 of lazy migrations: customer-fetch path triggers the
 * per-customer Trigger.dev task and the customer ends up migrated.
 *
 * Contract under test:
 *   Behavior:
 *     - POST /migrations.lazy_run starts a lazy-mode migration_run
 *       (lazy_run=true, status='running')
 *     - On the next /customers.get for an eligible customer:
 *       * runMigrationCustomerTask is enqueued with concurrencyKey
 *         `${migration_internal_id}:${customer.internal_id}`
 *       * eventually `migration_item_runs` has one `succeeded` row
 *       * subsequent /customers.get returns post-migration state
 *         (e.g. the new `dashboard` feature is now present)
 *   Side effects:
 *     - executeMigrateCustomerPlan invalidates the customer cache
 *     - exactly one `migration_item_runs` row per (migration, customer)
 */

import { expect, test } from "bun:test";
import {
	MigrationItemKind,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { finishLazyMigrationRun } from "@/internal/migrations/v2/actions/migrationRun/finishLazyMigrationRun.js";
import {
	countCustomerItemRunRows,
	getCustomerAndAwaitMigration,
	getInternalCustomerId,
	releaseLazyMigrationRun,
	startLazyMigration,
	waitForCustomerItemRunStatus,
} from "./utils/lazyMigrationTestUtils.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

test.concurrent(`${chalk.yellowBright("lazy migration: multiple customers on pro fetch + auto-migrate")}`, async () => {
	const firstCustomerId = "lazy-basic-first";
	const secondCustomerId = "lazy-basic-second";
	const thirdCustomerId = "lazy-basic-third";
	const plan = products.pro({ id: "lazy-basic-pro", items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId: firstCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([
				{ id: secondCustomerId, paymentMethod: "success" },
				{ id: thirdCustomerId, paymentMethod: "success" },
			]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.billing.attach({ productId: plan.id }),
			s.billing.attach({
				customerId: secondCustomerId,
				productId: plan.id,
			}),
			s.billing.attach({
				customerId: thirdCustomerId,
				productId: plan.id,
			}),
		],
	});

	const { migration, run_id } = await startLazyMigration({
		autumnV2_2,
		ctx,
		id: `${firstCustomerId}-mig`,
		planId: plan.id,
	});

	try {
		const customerIds = [firstCustomerId, secondCustomerId, thirdCustomerId];

		// ── Contract assertion 1: fetch + auto-migrate for each customer ──
		for (const customerId of customerIds) {
			const customer = await getCustomerAndAwaitMigration({
				autumnV2_2,
				customerId,
			});
			expect(customer.flags[TestFeature.Dashboard]).toBeDefined();
		}

		// ── Contract assertion 2: each customer has exactly one succeeded row ──
		for (const customerId of customerIds) {
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
		}
	} finally {
		await releaseLazyMigrationRun({ ctx, runId: run_id });
	}
});

test.concurrent(`${chalk.yellowBright("lazy migration: non-matching customer is not migrated")}`, async () => {
	const matchingCustomerId = "lazy-basic-matching";
	const mismatchCustomerId = "lazy-basic-mismatch";
	const proPlan = products.pro({ id: "lazy-basic-target-pro", items: [] });
	const premiumPlan = products.premium({
		id: "lazy-basic-other-premium",
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId: matchingCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: mismatchCustomerId, paymentMethod: "success" }]),
			s.products({ list: [proPlan, premiumPlan] }),
		],
		actions: [
			s.billing.attach({ productId: proPlan.id }),
			s.billing.attach({
				customerId: mismatchCustomerId,
				productId: premiumPlan.id,
			}),
		],
	});

	const { migration, run_id } = await startLazyMigration({
		autumnV2_2,
		ctx,
		id: `${matchingCustomerId}-mig`,
		planId: proPlan.id,
	});

	try {
		// Matching customer migrates as expected.
		await getCustomerAndAwaitMigration({
			autumnV2_2,
			customerId: matchingCustomerId,
		});

		// Mismatching customer's fetch is the in-memory pre-check site — assert
		// it neither queues a task nor writes a migration_item_runs row.
		const mismatchCustomer = await autumnV2_2.customers.get(mismatchCustomerId);
		expect(mismatchCustomer).toBeDefined();

		const mismatchInternalId = await getInternalCustomerId({
			customerId: mismatchCustomerId,
			ctx,
		});
		const mismatchRowCount = await countCustomerItemRunRows({
			ctx,
			migration,
			internalCustomerId: mismatchInternalId,
		});
		expect(mismatchRowCount).toBe(0);
	} finally {
		await releaseLazyMigrationRun({ ctx, runId: run_id });
	}
});

test.concurrent(`${chalk.yellowBright("lazy migration: marking the run as done clears the org cache and stops the in-memory check")}`, async () => {
	const customerId = "lazy-basic-done-clears";
	const plan = products.pro({ id: "lazy-basic-done-pro", items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const internalCustomerId = await getInternalCustomerId({ customerId, ctx });

	const { migration, run_id } = await startLazyMigration({
		autumnV2_2,
		ctx,
		id: `${customerId}-mig`,
		planId: plan.id,
	});

	try {
		// Trigger the migration once and wait for it to land.
		await getCustomerAndAwaitMigration({ autumnV2_2, customerId });
		await waitForCustomerItemRunStatus({
			ctx,
			migration,
			internalCustomerId,
			status: MigrationItemRunStatus.Succeeded,
		});
		expect(
			await countCustomerItemRunRows({
				ctx,
				migration,
				internalCustomerId,
			}),
		).toBe(1);

		// Finish the lazy run — should mark succeeded + clear org cache.
		await finishLazyMigrationRun({ ctx, runId: run_id });

		// Manually delete the customer's item_run row so we can detect whether
		// the helper still queues a task post-completion. If `pendingMigrations`
		// is correctly empty on the next request, no task should run and the
		// row should stay deleted.
		await ctx.db
			.delete(migrationItemRuns)
			.where(
				and(
					eq(migrationItemRuns.migration_internal_id, migration.internal_id),
					eq(migrationItemRuns.item_kind, MigrationItemKind.Customer),
					eq(migrationItemRuns.item_id, internalCustomerId),
				),
			);

		// Hit /customers.get a few times and give any queued task time to run.
		for (let i = 0; i < 5; i++) {
			await autumnV2_2.customers.get(customerId);
		}
		await timeout(3_000);

		// Helper should have short-circuited at `pendingMigrations.length === 0`
		// → no new `migration_item_runs` row recreated.
		expect(
			await countCustomerItemRunRows({
				ctx,
				migration,
				internalCustomerId,
			}),
		).toBe(0);
	} finally {
		await releaseLazyMigrationRun({ ctx, runId: run_id });
	}
});
