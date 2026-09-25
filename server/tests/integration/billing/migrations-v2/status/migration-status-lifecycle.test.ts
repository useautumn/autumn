// Only unscoped live runs affect migration status; the latest started run's outcome wins.
// A queued run waits while another migration is executing; both list endpoints agree.

import { expect, test } from "bun:test";
import {
	isTerminalMigrationRunStatus,
	MigrationRunStatus,
} from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { expectMigrationStatusCorrect } from "../utils/expectMigrationStatusCorrect.js";
import { clearMigrationRunHistory } from "../utils/runChunkedMigration.js";
import { waitForMigrationResult } from "../utils/runUpdatePlanMigration.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const waitForRunFinished = async ({
	ctx,
	runId,
}: {
	ctx: ScenarioCtx;
	runId: string;
}) =>
	waitForMigrationResult({
		timeoutMs: 90_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({ ctx, internalId: runId });
			if (!run) throw new Error("Run not found");
			if (!isTerminalMigrationRunStatus(run.status))
				throw new Error(`Run still ${run.status}`);
		},
	});

const seedRun = async ({
	ctx,
	migrationInternalId,
	status,
	started,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	status: MigrationRunStatus;
	started: boolean;
}) => {
	const inserted = await migrationRunRepo.insert({
		ctx,
		insert: { migration_internal_id: migrationInternalId, dry_run: false },
	});
	if (!inserted) throw new Error("Seed run conflicted with a live run");
	const finished =
		status !== MigrationRunStatus.Queued &&
		status !== MigrationRunStatus.Running;
	await migrationRunRepo.update({
		ctx,
		internalId: inserted.internal_id,
		updates: {
			status,
			started_at: started ? Date.now() : null,
			finished_at: finished ? Date.now() : null,
		},
	});
	return inserted.internal_id;
};

const finishSeededRun = async ({
	ctx,
	runId,
}: {
	ctx: ScenarioCtx;
	runId: string;
}) =>
	migrationRunRepo.update({
		ctx,
		internalId: runId,
		updates: { status: MigrationRunStatus.Succeeded, finished_at: Date.now() },
	});

test.concurrent(
	`${chalk.yellowBright("migration status: scoped and dry runs stay draft, a Run All becomes run")}`,
	async () => {
		const customerId = "mig-status-lifecycle";
		const otherCustomerId = `${customerId}-other`;
		const migrationId = `${customerId}-mig`;
		const plan = products.base({ id: `${customerId}-plan`, items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: otherCustomerId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: otherCustomerId, productId: plan.id }),
				),
			],
		});

		await clearMigrationRunHistory({ ctx, migrationId });
		await autumnV2_2.migrationsV2.deleteAndCreate({
			id: migrationId,
			filter: { customer: { plan: { plan_id: plan.id } } },
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
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId,
			status: "draft",
			blockedBy: null,
		});

		const dryRun = await autumnV2_2.migrationsV2.run({
			id: migrationId,
			dry_run: true,
		});
		await waitForRunFinished({ ctx, runId: dryRun.run_id });
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId,
			status: "draft",
		});

		const onlyRun = await autumnV2_2.migrationsV2.run({
			id: migrationId,
			dry_run: true,
			only: [customerId],
		});
		await waitForRunFinished({ ctx, runId: onlyRun.run_id });
		const sampleRun = await autumnV2_2.migrationsV2.run({
			id: migrationId,
			dry_run: true,
			limit: 1,
		});
		await waitForRunFinished({ ctx, runId: sampleRun.run_id });
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId,
			status: "draft",
		});

		const runAll = await autumnV2_2.migrationsV2.run({
			id: migrationId,
			dry_run: false,
		});
		await waitForRunFinished({ ctx, runId: runAll.run_id });
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId,
			status: "run",
			blockedBy: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("migration status: queued Run All behind another migration's executing run is waiting")}`,
	async () => {
		const customerId = "mig-status-waiting";
		const blockerId = `${customerId}-blocker`;
		const waiterId = `${customerId}-waiter`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});
		const blocker = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: blockerId,
		});
		const waiter = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: waiterId,
		});

		const blockerRunId = await seedRun({
			ctx,
			migrationInternalId: blocker.internal_id,
			status: MigrationRunStatus.Running,
			started: true,
		});
		const waiterRunId = await seedRun({
			ctx,
			migrationInternalId: waiter.internal_id,
			status: MigrationRunStatus.Queued,
			started: false,
		});

		try {
			await expectMigrationStatusCorrect({
				autumn: autumnV2_2,
				migrationId: waiterId,
				status: "waiting",
				blockedBy: blockerId,
			});
			await expectMigrationStatusCorrect({
				autumn: autumnV2_2,
				migrationId: blockerId,
				status: "running",
				blockedBy: null,
			});

			await finishSeededRun({ ctx, runId: blockerRunId });
			await expectMigrationStatusCorrect({
				autumn: autumnV2_2,
				migrationId: waiterId,
				status: "running",
				blockedBy: null,
			});
			await expectMigrationStatusCorrect({
				autumn: autumnV2_2,
				migrationId: blockerId,
				status: "run",
			});
		} finally {
			await finishSeededRun({ ctx, runId: waiterRunId });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("migration status: latest started run reports failed or canceled; canceled-before-start stays draft")}`,
	async () => {
		const customerId = "mig-status-history";
		const ranId = `${customerId}-ran`;
		const canceledAfterStartId = `${customerId}-canceled`;
		const neverStartedId = `${customerId}-never`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});
		const ran = await autumnV2_2.migrationsV2.deleteAndCreate({ id: ranId });
		const canceledAfterStart = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: canceledAfterStartId,
		});
		const neverStarted = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: neverStartedId,
		});

		await seedRun({
			ctx,
			migrationInternalId: ran.internal_id,
			status: MigrationRunStatus.Succeeded,
			started: true,
		});
		await seedRun({
			ctx,
			migrationInternalId: ran.internal_id,
			status: MigrationRunStatus.Failed,
			started: true,
		});
		await seedRun({
			ctx,
			migrationInternalId: canceledAfterStart.internal_id,
			status: MigrationRunStatus.Canceled,
			started: true,
		});
		await seedRun({
			ctx,
			migrationInternalId: neverStarted.internal_id,
			status: MigrationRunStatus.Canceled,
			started: false,
		});

		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId: ranId,
			status: "failed",
		});
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId: canceledAfterStartId,
			status: "canceled",
		});
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId: neverStartedId,
			status: "draft",
		});

		const list = await autumnV2_2.migrationsV2.list();
		const ranRow = list.list.find((migration) => migration.id === ranId);
		expect(ranRow?.has_live_runs).toBe(false);
	},
);
