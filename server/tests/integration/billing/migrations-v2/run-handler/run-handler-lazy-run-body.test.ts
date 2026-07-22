/**
 * Coverage for the `lazy_run` body param on `POST /migrations.run`.
 *
 * Contract under test:
 *   - `migrationsV2.run({ id, lazy_run: true })` persists `lazy_run = true`
 *     on the resulting `migration_runs` row.
 *   - Live lazy runs prepare update_plan artifacts before publishing work to
 *     customer lazy migration tasks.
 *   - `lazy_run=true` rejects targeted `only` runs because request-path
 *     lazy execution cannot respect the target list.
 *   - Default (`lazy_run` omitted / false) leaves the row in its
 *     background-only shape (`lazy_run = false`).
 *   - The response echoes the requested `lazy_run` value alongside
 *     `dry_run` and `run_id`.
 *   - Legacy concurrency input is accepted but effective concurrency is `1`.
 */

import { expect, test } from "bun:test";
import { ErrCode, migrationRuns } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

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
	`${chalk.yellowBright("run-handler lazy_run: lazy_run=true persists on migration_runs")}`,
	async () => {
		const suffix = Date.now();
		const customerId = `run-handler-lazy-true-${suffix}`;
		const plan = products.pro({
			id: `run-handler-lazy-true-pro-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
			buildDashboardMigration({
				id: `${customerId}-mig`,
				planId: plan.id,
			}),
		);

		const response = await autumnV2_2.migrationsV2.run({
			id: migration.id,
			lazy_run: true,
			concurrency: 7,
		});

		expect(response.migration_id).toBe(migration.id);
		expect(response.lazy_run).toBe(true);
		expect(response.concurrency).toBe(1);

		const updatedMigration = await migrationRepo.find({
			ctx,
			id: migration.id,
		});
		expect(updatedMigration.prepared_state).toHaveProperty(
			"ensure_prices_and_entitlements:update_plan",
		);

		// Cleanup so other tests can claim this migration. Direct delete by
		// the returned run_id (idempotent — survives if the trigger task
		// already terminally marked it).
		const [row] = await ctx.db
			.select()
			.from(migrationRuns)
			.where(eq(migrationRuns.internal_id, response.run_id));
		expect(row).toBeDefined();
		expect(row?.lazy_run).toBe(true);

		await ctx.db
			.delete(migrationRuns)
			.where(
				and(
					eq(migrationRuns.internal_id, response.run_id),
					eq(migrationRuns.org_id, ctx.org.id),
				),
			);
	},
);

test.concurrent(
	`${chalk.yellowBright("run-handler lazy_run: rejects targeted only runs")}`,
	async () => {
		const suffix = Date.now();
		const customerId = `run-handler-lazy-only-${suffix}`;
		const plan = products.pro({
			id: `run-handler-lazy-only-pro-${suffix}`,
			items: [],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
			buildDashboardMigration({
				id: `${customerId}-mig`,
				planId: plan.id,
			}),
		);

		await expect(
			autumnV2_2.migrationsV2.run({
				id: migration.id,
				lazy_run: true,
				only: [customerId],
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: expect.stringContaining("lazy_run"),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("run-handler lazy_run: default lazy_run=false on migration_runs")}`,
	async () => {
		const suffix = Date.now();
		const customerId = `run-handler-lazy-default-${suffix}`;
		const plan = products.pro({
			id: `run-handler-lazy-default-pro-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
			buildDashboardMigration({
				id: `${customerId}-mig`,
				planId: plan.id,
			}),
		);

		const response = await autumnV2_2.migrationsV2.run({
			id: migration.id,
		});

		expect(response.lazy_run).toBe(false);

		const [row] = await ctx.db
			.select()
			.from(migrationRuns)
			.where(eq(migrationRuns.internal_id, response.run_id));
		expect(row?.lazy_run).toBe(false);

		await ctx.db
			.delete(migrationRuns)
			.where(
				and(
					eq(migrationRuns.internal_id, response.run_id),
					eq(migrationRuns.org_id, ctx.org.id),
				),
			);
	},
);
