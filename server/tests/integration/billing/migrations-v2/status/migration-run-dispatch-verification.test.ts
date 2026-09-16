/**
 * A dispatched run must be proven to exist on trigger.dev before the claim is
 * treated as successful. The SDK builds the run id client-side, so a handle
 * comes back even when the enqueue never reaches the platform; the run row
 * then sits `queued` forever and the dashboard reports it as Running with no
 * items, which is indistinguishable from a healthy run.
 *
 * Red (current):  an unverifiable handle leaves the row `queued`.
 * Green (after):  the claim fails the row and surfaces the error.
 */

import { expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";

const MISSING_TRIGGER_RUN_ID = "run_never_enqueued";

test.concurrent(
	`${chalk.yellowBright("migration run dispatch: a handle the platform never received fails the run")}`,
	async () => {
		const customerId = "mig-dispatch-unverified";
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
				claimed: async () => ({ triggerRunId: MISSING_TRIGGER_RUN_ID }),
				verifyDispatch: async () => false,
			}),
		).rejects.toThrow(/could not be verified|not found/i);

		const [run] = await migrationRunRepo.list({
			ctx,
			migrationInternalId: migration.internal_id,
		});
		expect(run).toMatchObject({
			status: MigrationRunStatus.Failed,
			started_at: null,
		});
		expect(run.error_message).toContain(MISSING_TRIGGER_RUN_ID);
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run dispatch: a verified handle keeps the run queued for the worker")}`,
	async () => {
		const customerId = "mig-dispatch-verified";
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
			claimed: async () => ({ triggerRunId: "run_enqueued_ok" }),
			verifyDispatch: async () => true,
		});

		const [run] = await migrationRunRepo.list({
			ctx,
			internalId: migrationRunId,
		});
		expect(run).toMatchObject({
			status: MigrationRunStatus.Queued,
			started_at: null,
			trigger_run_id: "run_enqueued_ok",
		});

		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: {
				status: MigrationRunStatus.Succeeded,
				finished_at: Date.now(),
			},
		});
	},
);
