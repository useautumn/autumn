import { expect, test } from "bun:test";
import {
	isTerminalMigrationRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration";

const waitForRunCompleted = async ({
	ctx,
	runId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	runId: string;
}) =>
	waitForMigrationResult({
		timeoutMs: 60_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({ ctx, internalId: runId });
			if (!run) throw new Error("Run not found");
			if (!isTerminalMigrationRunStatus(run.status))
				throw new Error(`Run still ${run.status}`);
		},
	});

const countItemRuns = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	migrationInternalId: string;
	migrationRunId: string;
}) => {
	const rows = await ctx.db
		.select({ id: migrationItemRuns.migration_item_run_id })
		.from(migrationItemRuns)
		.where(
			and(
				eq(migrationItemRuns.migration_internal_id, migrationInternalId),
				eq(migrationItemRuns.migration_run_id, migrationRunId),
				eq(migrationItemRuns.dry_run, true),
			),
		);
	return rows.length;
};

test(`${chalk.yellowBright("migrations plan-filter: version filter restricts customer selection by product version")}`, async () => {
	const suffix = Date.now();
	const customerId = `mig-plan-filter-version-${suffix}`;
	const plan = products.base({
		id: `mig-plan-filter-version-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await autumnV1.products.update(plan.id, {
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const noMatchMigration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-mig-nomatch`,
		filter: {
			customer: { plan: { plan_id: plan.id, version: 2 } },
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});
	const noMatchRun = await autumnV2_2.migrationsV2.run({
		id: noMatchMigration.id,
		dry_run: true,
	});
	await waitForRunCompleted({ ctx, runId: noMatchRun.run_id });
	expect(
		await countItemRuns({
			ctx,
			migrationInternalId: noMatchMigration.internal_id,
			migrationRunId: noMatchRun.run_id,
		}),
		"customer on v1 must NOT match version: 2 filter",
	).toBe(0);

	const matchMigration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-mig-match`,
		filter: {
			customer: { plan: { plan_id: plan.id, version: 1 } },
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});
	const matchRun = await autumnV2_2.migrationsV2.run({
		id: matchMigration.id,
		dry_run: true,
	});
	await waitForRunCompleted({ ctx, runId: matchRun.run_id });
	expect(
		await countItemRuns({
			ctx,
			migrationInternalId: matchMigration.internal_id,
			migrationRunId: matchRun.run_id,
		}),
		"customer on v1 must match version: 1 filter",
	).toBe(1);

	const ltMigration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-mig-lt`,
		filter: {
			customer: { plan: { plan_id: plan.id, version: { $lt: 2 } } },
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});
	const ltRun = await autumnV2_2.migrationsV2.run({
		id: ltMigration.id,
		dry_run: true,
	});
	await waitForRunCompleted({ ctx, runId: ltRun.run_id });
	expect(
		await countItemRuns({
			ctx,
			migrationInternalId: ltMigration.internal_id,
			migrationRunId: ltRun.run_id,
		}),
		"customer on v1 must match version: { $lt: 2 } filter",
	).toBe(1);
});
