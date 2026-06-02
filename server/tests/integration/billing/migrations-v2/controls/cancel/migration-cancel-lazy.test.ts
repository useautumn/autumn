import { expect, test } from "bun:test";
import { type ApiCustomerV5, MigrationRunStatus } from "@autumn/shared";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import {
	countCustomerItemRunRows,
	getCustomerAndAwaitMigration,
	getInternalCustomerId,
	startLazyMigration,
} from "../../lazy/utils/lazyMigrationTestUtils.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const uniqueSuffix = () =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.concurrent(
	`${chalk.yellowBright("migration cancel (lazy): no further per-customer migrations run after cancel")}`,
	async () => {
		/**
		 * Contract under test:
		 *   New endpoint:
		 *     - POST /migrations.cancel_run sets a cancel token and (for lazy
		 *       runs) marks the run `canceled` + clears the org cache.
		 *   New behaviors:
		 *     - Before cancel, fetching a matching customer lazily migrates them
		 *       (positive control).
		 *     - After cancel, fetching another matching customer does NOT migrate
		 *       them and creates NO migration_item_runs row (enqueue + task gates,
		 *       and the dropped `pendingMigrations` entry).
		 *   Side effects:
		 *     - The migration_runs row settles to `canceled`.
		 */
		const suffix = uniqueSuffix();
		const customerA = `cancel-lazy-a-${suffix}`;
		const customerB = `cancel-lazy-b-${suffix}`;
		const plan = products.base({
			id: `cancel-lazy-plan-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: customerA,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customerB }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: customerB, productId: plan.id }),
				),
			],
		});

		const { migration, run_id } = await startLazyMigration({
			autumnV2_2,
			ctx,
			id: `cancel-lazy-mig-${suffix}`,
			planId: plan.id,
		});

		// Positive control: fetching A lazily migrates it.
		const custA = await getCustomerAndAwaitMigration({
			autumnV2_2,
			customerId: customerA,
		});
		expectFlagCorrect({
			customer: custA,
			featureId: TestFeature.Dashboard,
			present: true,
		});

		const cancel = await autumnV2_2.migrationsV2.cancelRun({ id: migration.id });
		expect(cancel.canceled).toBe(true);
		expect(cancel.run_id).toBe(run_id);

		const [run] = await migrationRunRepo.list({ ctx, internalId: run_id });
		expect(run).toBeDefined();
		expect(run.status).toBe(MigrationRunStatus.Canceled);

		// After cancel, repeatedly fetch B — each fetch is a chance for the lazy
		// path to (incorrectly) enqueue a migration. It must not.
		for (let i = 0; i < 4; i++) {
			await autumnV2_2.customers.get<ApiCustomerV5>(customerB);
			await timeout(1_000);
		}

		const custB = await autumnV2_2.customers.get<ApiCustomerV5>(customerB);
		expectFlagCorrect({
			customer: custB,
			featureId: TestFeature.Dashboard,
			present: false,
		});

		const internalB = await getInternalCustomerId({
			customerId: customerB,
			ctx,
		});
		const rowsB = await countCustomerItemRunRows({
			ctx,
			migration,
			internalCustomerId: internalB,
		});
		expect(rowsB).toBe(0);
	},
);
