/**
 * Lazy migrations are hard-disabled (LAZY_MIGRATION_RUNS_DISABLED).
 *
 * Contract under test:
 *   - `POST /migrations.lazy_run` is rejected with 400.
 *   - `POST /migrations.run` with `lazy_run: true` is rejected with 400.
 *   - A pre-existing live lazy run (legacy state) no longer enqueues
 *     per-customer migrations on the customer-read hot path.
 */

import { expect, test } from "bun:test";
import { ErrCode, MigrationItemKind, MigrationRunStatus } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const buildDashboardMigration = ({
	id,
	planId,
}: {
	id: string;
	planId: string;
}) => ({
	id,
	filter: { customer: { plan: { plan_id: planId } } },
	operations: {
		customer: [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId },
				customize: { add_items: [itemsV2.dashboard()] },
			},
		],
	},
});

test.concurrent(
	`${chalk.yellowBright("lazy disabled: /migrations.lazy_run and lazy_run=true are rejected")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerId = `lazy-disabled-api-${suffix}`;
		const plan = products.base({
			id: `lazy-disabled-plan-${suffix}`,
			items: [],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
			buildDashboardMigration({
				id: `lazy-disabled-mig-${suffix}`,
				planId: plan.id,
			}),
		);

		await expect(
			autumnV2_2.migrationsV2.lazyRun({ id: migration.id }),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: expect.stringContaining("disabled"),
		});

		await expect(
			autumnV2_2.migrationsV2.run({ id: migration.id, lazy_run: true }),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: expect.stringContaining("disabled"),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("lazy disabled: a legacy live lazy run no longer migrates customers on read")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerId = `lazy-disabled-read-${suffix}`;
		const plan = products.base({
			id: `lazy-disabled-read-plan-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
			buildDashboardMigration({
				id: `lazy-disabled-read-mig-${suffix}`,
				planId: plan.id,
			}),
		);

		// Manufacture the legacy state: a live lazy run published to the org.
		const lazyRun = await migrationRunRepo.insert({
			ctx,
			insert: {
				migration_internal_id: migration.internal_id,
				dry_run: false,
				lazy_run: true,
				only_ids: null,
				target_limit: undefined,
			},
		});
		expect(lazyRun).not.toBeNull();
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });

		try {
			// Customer reads must not enqueue per-customer lazy migrations.
			await autumnV2_2.customers.get(customerId);
			await timeout(3_000);

			const customer = await CusService.get({
				db: ctx.db,
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(customer).not.toBeNull();
			const itemRun = await migrationItemRunRepo.get({
				ctx,
				migrationInternalId: migration.internal_id,
				itemKind: MigrationItemKind.Customer,
				itemId: customer?.internal_id ?? "",
			});
			expect(itemRun).toBeNull();
		} finally {
			if (lazyRun) {
				await migrationRunRepo.update({
					ctx,
					internalId: lazyRun.internal_id,
					updates: {
						status: MigrationRunStatus.Failed,
						finished_at: Date.now(),
					},
				});
				await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
			}
		}
	},
);
