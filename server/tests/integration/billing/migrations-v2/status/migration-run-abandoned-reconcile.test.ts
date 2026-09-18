/**
 * A lost settle-write strands a run as `running`, and the partial unique index
 * then blocks that migration forever. Seen in production on six runs.
 *
 * Red:   the stranded row stays `running` and blocks the next run.
 * Green: a confirmed-dead trigger run settles; a live or unreachable one does not.
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

	const liveRunId = await strandRun({
		ctx,
		migrationInternalId: migration.internal_id,
		triggerRunId: "run_still_alive",
	});

	await reconcileAbandonedRuns({
		ctx,
		runs: [await statusOf({ ctx, internalId: liveRunId })],
		isTerminal: async () => false,
	});
	expect((await statusOf({ ctx, internalId: liveRunId })).status).toBe(
		MigrationRunStatus.Running,
	);

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

	// listMigrationStatuses is what the dashboard actually calls.
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
