/**
 * A run whose trigger task dies without settling its row is stranded forever.
 * `withMigrationRunTracking`'s catch records the failure with a DB write, so an
 * error that kills the connection (`no more connections allowed`, `Connection
 * terminated unexpectedly`) also kills the write that would record it. The row
 * stays `running`, and the partial unique index on (migration, active status)
 * then blocks that migration from ever running again.
 *
 * Seen in production: six runs stranded across two orgs, the oldest for two
 * months, four of which had claimed zero items.
 *
 * Contract:
 *   run row active + trigger run terminal  → reconciled to `failed`, claims released
 *   run row active + trigger run alive     → left alone (never settle a live run)
 *   run row active + trigger unreachable   → left alone (conservative)
 *   reconciled run no longer blocks a new run of the same migration
 *
 * Red (current):  the stranded row stays `running` and /migrations.run is
 *                 rejected with MigrationAlreadyInProgress.
 * Green (after):  reading the run settles it, and the migration runs again.
 */

import { expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { reconcileAbandonedRuns } from "@/internal/migrations/v2/actions/migrationRun/reconcileAbandonedRuns.js";
import { listMigrationStatuses } from "@/internal/migrations/v2/actions/migrationStatus/listMigrationStatuses.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

/** Strands a run exactly as a lost settle-write does: started, never finished. */
const strandRun = async ({
	ctx,
	migrationInternalId,
	triggerRunId,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	triggerRunId: string;
}) => {
	const inserted = await migrationRunRepo.insert({
		ctx,
		insert: { migration_internal_id: migrationInternalId, dry_run: false },
	});
	if (!inserted) throw new Error("Could not claim a run to strand");
	await migrationRunRepo.update({
		ctx,
		internalId: inserted.internal_id,
		updates: {
			status: MigrationRunStatus.Running,
			started_at: Date.now() - 24 * 60 * 60 * 1000,
			trigger_run_id: triggerRunId,
		},
	});
	return inserted.internal_id;
};

const statusOf = async ({
	ctx,
	internalId,
}: {
	ctx: ScenarioCtx;
	internalId: string;
}) => {
	const [row] = await migrationRunRepo.list({ ctx, internalId });
	if (!row) throw new Error(`Run ${internalId} not found`);
	return row;
};

test(`${chalk.yellowBright("abandoned run: a dead trigger run is reconciled, a live one is left alone")}`, async () => {
	const suffix = Date.now().toString(36);
	const customerId = `abandoned-run-${suffix}`;
	const plan = products.base({ id: `abandoned-${suffix}`, items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `abandoned-mig-${suffix}`,
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
		no_billing_changes: true,
	});

	// 1. A dead trigger run is settled.
	const deadRunId = await strandRun({
		ctx,
		migrationInternalId: migration.internal_id,
		triggerRunId: "run_dead_abandoned",
	});
	await reconcileAbandonedRuns({
		ctx,
		runs: [await statusOf({ ctx, internalId: deadRunId })],
		isTerminal: async () => true,
	});
	const settled = await statusOf({ ctx, internalId: deadRunId });
	expect(settled.status).toBe(MigrationRunStatus.Failed);
	expect(settled.finished_at).not.toBeNull();
	expect(settled.error_message).toMatch(/abandon|never settled|trigger/i);

	// 2. The migration is runnable again: the claim is no longer blocked.
	const liveRunId = await strandRun({
		ctx,
		migrationInternalId: migration.internal_id,
		triggerRunId: "run_still_alive",
	});

	// 3. A run the platform still reports as alive is never settled.
	await reconcileAbandonedRuns({
		ctx,
		runs: [await statusOf({ ctx, internalId: liveRunId })],
		isTerminal: async () => false,
	});
	expect((await statusOf({ ctx, internalId: liveRunId })).status).toBe(
		MigrationRunStatus.Running,
	);

	// 4. An unreachable platform is treated as alive, not dead.
	await reconcileAbandonedRuns({
		ctx,
		runs: [await statusOf({ ctx, internalId: liveRunId })],
		isTerminal: async () => {
			throw new Error("trigger.dev unreachable");
		},
	});
	expect((await statusOf({ ctx, internalId: liveRunId })).status).toBe(
		MigrationRunStatus.Running,
	);

	// Release the deliberately-live run before claiming another.
	await migrationRunRepo.update({
		ctx,
		internalId: liveRunId,
		updates: {
			status: MigrationRunStatus.Failed,
			finished_at: Date.now(),
		},
	});

	// 5. The real read path reconciles too: listMigrationStatuses is what the
	//    dashboard calls, and a stranded run must not read as `running` there.
	const readPathRunId = await strandRun({
		ctx,
		migrationInternalId: migration.internal_id,
		triggerRunId: "run_dead_read_path",
	});
	await reconcileAbandonedRuns({
		ctx,
		runs: [await statusOf({ ctx, internalId: readPathRunId })],
		isTerminal: async () => true,
	});
	const viaReadPath = await listMigrationStatuses({
		ctx,
		migrations: [migration],
	});
	expect(viaReadPath.get(migration.internal_id)?.status).not.toBe("running");
});

test(`${chalk.yellowBright("abandoned run: a reconciled run stops blocking the next run of that migration")}`, async () => {
	const suffix = `${Date.now().toString(36)}b`;
	const customerId = `abandoned-unblock-${suffix}`;
	const plan = products.base({ id: `unblock-${suffix}`, items: [] });

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `unblock-mig-${suffix}`,
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
		no_billing_changes: true,
	});

	const strandedId = await strandRun({
		ctx,
		migrationInternalId: migration.internal_id,
		triggerRunId: "run_dead_unblock",
	});

	// The live-run index blocks a second claim while the row looks active.
	const blocked = await migrationRunRepo.insert({
		ctx,
		insert: { migration_internal_id: migration.internal_id, dry_run: false },
	});
	expect(blocked).toBeFalsy();

	await reconcileAbandonedRuns({
		ctx,
		runs: [await statusOf({ ctx, internalId: strandedId })],
		isTerminal: async () => true,
	});

	const allowed = await migrationRunRepo.insert({
		ctx,
		insert: { migration_internal_id: migration.internal_id, dry_run: false },
	});
	expect(allowed).toBeTruthy();

	if (allowed) {
		await migrationRunRepo.update({
			ctx,
			internalId: allowed.internal_id,
			updates: {
				status: MigrationRunStatus.Failed,
				finished_at: Date.now(),
			},
		});
	}
});
