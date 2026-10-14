import { test } from "bun:test";
import {
	isTerminalMigrationRunStatus,
	MigrationRunStatus,
	ms,
} from "@autumn/shared";
import { clearMigrationRunHistory } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { waitForMigrationResult } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type ScenarioClient = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

const CONVERGED_IDS = ["a", "b", "c"].map((id) => `qa-noop-${id}`);
const SCOPE_IDS = ["a", "b", "c", "d", "e", "f"].map((id) => `qa-scope-${id}`);

const createMigration = async ({
	ctx,
	autumn,
	migrationId,
	planId,
}: {
	ctx: ScenarioCtx;
	autumn: ScenarioClient;
	migrationId: string;
	planId: string;
}) => {
	await clearMigrationRunHistory({ ctx, migrationId });
	return autumn.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter: { customer: { plan: { plan_id: planId } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: planId },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
		no_billing_changes: true,
	});
};

const runToCompletion = async ({
	ctx,
	autumn,
	migrationId,
}: {
	ctx: ScenarioCtx;
	autumn: ScenarioClient;
	migrationId: string;
}) => {
	const { run_id } = await autumn.migrationsV2.run({
		id: migrationId,
		dry_run: false,
	});
	await waitForMigrationResult({
		timeoutMs: 180_000,
		pollIntervalMs: 2_000,
		waitFor: async () => {
			const [row] = await migrationRunRepo.list({ ctx, internalId: run_id });
			if (!row) throw new Error("Run not found");
			if (!isTerminalMigrationRunStatus(row.status))
				throw new Error(`Run still ${row.status}`);
		},
	});
	const [row] = await migrationRunRepo.list({ ctx, internalId: run_id });
	return row.status;
};

const seedTerminalRun = async ({
	ctx,
	migrationInternalId,
	status,
	errorMessage,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	status: MigrationRunStatus;
	errorMessage?: string;
}) => {
	const inserted = await migrationRunRepo.insert({
		ctx,
		insert: { migration_internal_id: migrationInternalId, dry_run: false },
	});
	if (!inserted) throw new Error("Could not claim a run to seed");
	await migrationRunRepo.update({
		ctx,
		internalId: inserted.internal_id,
		updates: {
			status,
			started_at: Date.now() - ms.hours(1),
			finished_at: Date.now(),
			error_message: errorMessage ?? null,
		},
	});
	return status;
};

const seedAbandonedRun = async ({
	ctx,
	migrationInternalId,
	triggerRunId,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	triggerRunId: string | null;
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
			started_at: Date.now() - ms.days(1),
			...(triggerRunId ? { trigger_run_id: triggerRunId } : {}),
		},
	});
	return inserted.internal_id;
};

test(`${chalk.yellowBright("migration-setup: no-op run status + scoped progress QA")}`, async () => {
	const convergedPlan = products.base({
		id: "noop",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scopePlan = products.base({
		id: "scope",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const [firstId, ...restConverged] = CONVERGED_IDS;

	const { autumnV2_2, ctx } = await initScenario({
		customerId: firstId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([...restConverged, ...SCOPE_IDS].map((id) => ({ id }))),
			s.products({ list: [convergedPlan, scopePlan], prefix: "qa" }),
		],
		actions: [
			s.parallel(
				...CONVERGED_IDS.map((customerId) =>
					s.billing.attach({
						customerId,
						productId: convergedPlan.id,
						items: [items.dashboard()],
					}),
				),
				...SCOPE_IDS.map((customerId) =>
					s.billing.attach({ customerId, productId: scopePlan.id }),
				),
			),
		],
	});

	const noChanges = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-nochanges",
		planId: convergedPlan.id,
	});
	const noChangesStatus = await runToCompletion({
		ctx,
		autumn: autumnV2_2,
		migrationId: noChanges.id,
	});

	const changes = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-changes",
		planId: scopePlan.id,
	});
	const changesStatus = await runToCompletion({
		ctx,
		autumn: autumnV2_2,
		migrationId: changes.id,
	});

	const scope = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-scope",
		planId: scopePlan.id,
	});

	const failed = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-failed",
		planId: convergedPlan.id,
	});
	const failedRunStatus = await seedTerminalRun({
		ctx,
		migrationInternalId: failed.internal_id,
		status: MigrationRunStatus.Failed,
		errorMessage: "Seeded failure: the run errored partway through",
	});

	const abandoned = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-abandoned",
		planId: convergedPlan.id,
	});
	const [deadRun] = await migrationRunRepo.list({
		ctx,
		migrationInternalId: changes.internal_id,
	});
	const abandonedRunId = await seedAbandonedRun({
		ctx,
		migrationInternalId: abandoned.internal_id,
		triggerRunId: deadRun?.trigger_run_id ?? null,
	});

	console.log(
		[
			"",
			chalk.bold("QA seed ready"),
			`  qa-nochanges  run settled: ${chalk.yellowBright(noChangesStatus)}  (expect no_changes)`,
			`  qa-changes    run settled: ${chalk.yellowBright(changesStatus)}  (expect succeeded)`,
			`  qa-scope      draft over ${SCOPE_IDS.length} customers — id ${scope.id}`,
			`  qa-failed     run settled: ${chalk.yellowBright(failedRunStatus)}`,
			`  qa-abandoned  run left running, no trigger handle (${abandonedRunId})`,
			"",
			"  Scoped-progress check: open qa-scope, Run Sample with limit 2,",
			"  and confirm the footer reads '… of 2', not '… of 6'.",
			"",
			"  Recovery check: qa-abandoned starts stranded. Loading the migrations",
			"  list reconciles it (trigger run is dead), so it stops blocking and",
			"  becomes runnable again.",
			"",
		].join("\n"),
	);
});
