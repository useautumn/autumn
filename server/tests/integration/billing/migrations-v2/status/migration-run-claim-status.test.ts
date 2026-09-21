/**
 * withMigrationRunClaim: dispatch is not execution. A trigger-dispatched run
 * stays `queued` (started_at null) until withMigrationRunTracking starts it,
 * so the computed migration status can tell "waiting in the org queue" from
 * "executing". Lazy runs are live as soon as prepare completes and flip to
 * `running` at claim time.
 *
 * Red (before):  the claim flipped every run to `running` with started_at set.
 * Green (after): only lazy runs flip at claim; others stay queued.
 */

import { expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";

const finishRun = async ({
	ctx,
	migrationRunId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	migrationRunId: string;
}) =>
	migrationRunRepo.update({
		ctx,
		internalId: migrationRunId,
		updates: { status: MigrationRunStatus.Succeeded, finished_at: Date.now() },
	});

test.concurrent(
	`${chalk.yellowBright("migration run claim: trigger-dispatched run stays queued until execution starts")}`,
	async () => {
		const customerId = "mig-claim-status-queued";
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: migrationId,
		});

		const { migrationRunId, triggerRunId } = await withMigrationRunClaim({
			ctx,
			migration,
			dryRun: false,
			claimed: async () => ({ triggerRunId: "run_fake_trigger" }),
		});

		const [run] = await migrationRunRepo.list({
			ctx,
			internalId: migrationRunId,
		});
		expect(triggerRunId).toBe("run_fake_trigger");
		expect(run).toMatchObject({
			status: MigrationRunStatus.Queued,
			started_at: null,
			trigger_run_id: "run_fake_trigger",
		});

		await finishRun({ ctx, migrationRunId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run claim: lazy run is live at claim time")}`,
	async () => {
		const customerId = "mig-claim-status-lazy";
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: migrationId,
		});

		const { migrationRunId } = await withMigrationRunClaim({
			ctx,
			migration,
			dryRun: false,
			lazyRun: true,
			claimed: async () => undefined,
		});

		const [run] = await migrationRunRepo.list({
			ctx,
			internalId: migrationRunId,
		});
		expect(run.status).toBe(MigrationRunStatus.Running);
		expect(run.started_at).not.toBeNull();

		await finishRun({ ctx, migrationRunId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run claim: a failed dispatch releases the claim as failed without starting")}`,
	async () => {
		const customerId = "mig-claim-status-failed";
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: migrationId,
		});

		await expect(
			withMigrationRunClaim({
				ctx,
				migration,
				dryRun: false,
				claimed: async () => {
					throw new Error("dispatch exploded");
				},
			}),
		).rejects.toThrow("dispatch exploded");

		const [run] = await migrationRunRepo.list({
			ctx,
			migrationInternalId: migration.internal_id,
		});
		expect(run).toMatchObject({
			status: MigrationRunStatus.Failed,
			started_at: null,
			error_message: "dispatch exploded",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run claim: a run whose handle cannot be persisted fails instead of orphaning")}`,
	async () => {
		const customerId = `mig-handle-write-${Date.now()}`;
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `${customerId}-mig`,
		});

		await expect(
			withMigrationRunClaim({
				ctx,
				migration,
				dryRun: false,
				claimed: async () => ({ triggerRunId: "run_handle_write_fails" }),
				verifyDispatch: async () => "found" as const,
				persistTriggerRunId: async () => {
					throw new Error("connection terminated unexpectedly");
				},
			}),
		).rejects.toThrow(/connection terminated/i);

		const [run] = await migrationRunRepo.list({
			ctx,
			migrationInternalId: migration.internal_id,
		});
		expect(run).toMatchObject({ status: MigrationRunStatus.Failed });
		expect(run.finished_at).not.toBeNull();
	},
);
