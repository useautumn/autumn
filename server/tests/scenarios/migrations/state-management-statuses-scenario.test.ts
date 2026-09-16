import { test } from "bun:test";
import {
	type FullCustomer,
	MigrationItemKind,
	MigrationItemRunSkipReason,
	MigrationRunStatus,
} from "@autumn/shared";
import { getInternalCustomerId } from "@tests/integration/billing/migrations-v2/batch-migrations/batchTestUtils";
import { clearMigrationRunHistory } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { waitForMigrationResult } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	type MigrationItemTrackingResult,
	withMigrationItemTracking,
} from "@/internal/migrations/v2/actions/migrationItem/withMigrationItemTracking.js";
import { buildSkippedMigrateCustomerResult } from "@/internal/migrations/v2/hooks/index.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/migrateCustomerContext.js";
import {
	migrationItemRunRepo,
	migrationRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type ScenarioClient = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

const CUSTOMER_IDS = ["a", "b", "c", "d", "e", "f"].map((id) => `qa-st-${id}`);
/** Seeded live runs make every other queued Run All in the org read
 * `waiting`, so group runs settle them; set this for manual QA. */
const KEEP_LIVE_RUNS = process.env.QA_KEEP_LIVE_RUNS === "1";

const transientDbError = () =>
	Object.assign(
		new Error("terminating connection due to administrator command"),
		{
			code: "ECONNRESET",
		},
	);

/** Live runs block `deleteAndCreate`, so settle them before recreating. */
const resetMigration = async ({
	ctx,
	migrationId,
}: {
	ctx: ScenarioCtx;
	migrationId: string;
}) => {
	const migration = await migrationRepo
		.find({ ctx, id: migrationId })
		.catch(() => null);
	if (!migration) return;
	const liveRuns = await migrationRunRepo.list({
		ctx,
		migrationInternalId: migration.internal_id,
		active: true,
	});
	for (const run of liveRuns) {
		await migrationRunRepo.update({
			ctx,
			internalId: run.internal_id,
			updates: { status: MigrationRunStatus.Canceled, finished_at: Date.now() },
		});
	}
	await clearMigrationRunHistory({ ctx, migrationId });
};

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
	await resetMigration({ ctx, migrationId });
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

const seedRun = async ({
	ctx,
	migrationInternalId,
	status,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	status: MigrationRunStatus;
}) => {
	const run = await migrationRunRepo.insert({
		ctx,
		insert: { migration_internal_id: migrationInternalId, dry_run: false },
	});
	if (!run) throw new Error("Seed run conflicted with a live run");
	await migrationRunRepo.update({
		ctx,
		internalId: run.internal_id,
		updates: {
			status,
			started_at: status === MigrationRunStatus.Queued ? null : Date.now(),
		},
	});
	return run.internal_id;
};

/**
 * QA setup for every migration status and every item outcome.
 *
 *   plan qa-status, customers qa-st-a..f on it
 *
 *   qa-dry      draft   — dry run only, so dry-run rows show without a Run All
 *   qa-skips    run     — a: guard skip (ineligible)   b: connection dropped (ineligible)
 *                         c: no_updates_needed         d: failed (error shown in sheet)
 *                         e: succeeded                 f: never claimed
 *   qa-running  running — a, b claimed and running, c succeeded; the run row is
 *                         seeded so it stays executing until you cancel it
 *   qa-waiting  waiting — queued behind qa-running
 *
 * qa-running and qa-waiting stay live only with QA_KEEP_LIVE_RUNS=1; while
 * they are, any other Run All in the org reads "Waiting on qa-running" until
 * its trigger task starts. Cancel qa-running when done.
 */
test(`${chalk.yellowBright("migration-setup: state management statuses QA")}`, async () => {
	const plan = products.base({
		id: "status",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const [firstCustomerId, ...otherCustomerIds] = CUSTOMER_IDS;

	const { autumnV2_2, ctx } = await initScenario({
		customerId: firstCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherCustomerIds.map((id) => ({ id }))),
			s.products({ list: [plan], prefix: "qa" }),
		],
		actions: [
			s.parallel(
				...CUSTOMER_IDS.map((customerId) =>
					s.billing.attach({ customerId, productId: plan.id }),
				),
			),
		],
	});
	const [a, b, c, d, e] = await Promise.all(
		CUSTOMER_IDS.map(async (customerId) => ({
			kind: MigrationItemKind.Customer,
			internal_id: await getInternalCustomerId({ ctx, customerId }),
			id: customerId,
		})),
	);

	const dry = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-dry",
		planId: plan.id,
	});
	const dryRun = await autumnV2_2.migrationsV2.run({
		id: dry.id,
		dry_run: true,
	});
	await waitForMigrationResult({
		timeoutMs: 120_000,
		pollIntervalMs: 2_000,
		waitFor: async () => {
			const [row] = await migrationRunRepo.list({
				ctx,
				internalId: dryRun.run_id,
			});
			if (
				row?.status === MigrationRunStatus.Queued ||
				row?.status === MigrationRunStatus.Running
			)
				throw new Error(`qa-dry still ${row.status}`);
		},
	});

	const skips = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-skips",
		planId: plan.id,
	});
	const skipsRunId = await seedRun({
		ctx,
		migrationInternalId: skips.internal_id,
		status: MigrationRunStatus.Running,
	});
	const track = (
		item: typeof a,
		run: () => Promise<MigrationItemTrackingResult>,
	) =>
		withMigrationItemTracking({
			ctx,
			migrationInternalId: skips.internal_id,
			migrationRunId: skipsRunId,
			dryRun: false,
			claimItemRun: true,
			item,
			run,
		});
	const preview = (item: typeof a) => ({
		id: item.id,
		name: item.id,
		email: `${item.id}@example.com`,
	});
	await track(a, async () =>
		buildSkippedMigrateCustomerResult({
			context: {
				fullCustomer: { id: a.id } as FullCustomer,
			} as MigrateCustomerContext,
			skip: {
				reason: "manual_review",
				response: { guard: { pluginId: "qa-guard", reason: "manual_review" } },
			},
		}),
	);
	await track(b, async () => {
		throw transientDbError();
	});
	await track(c, async () => ({
		itemPreview: preview(c),
		status: "skipped" as const,
		skipReason: MigrationItemRunSkipReason.NoUpdatesNeeded,
		response: {
			skip_reason: MigrationItemRunSkipReason.NoUpdatesNeeded,
			preview: { plan_changes: [], balance_changes: [], flag_changes: [] },
		},
	}));
	await track(d, async () => {
		throw new Error("Stripe: Your card was declined (simulated for QA)");
	}).catch(() => undefined);
	await track(e, async () => ({
		itemPreview: preview(e),
		status: "succeeded" as const,
		response: {},
	}));
	await migrationRunRepo.update({
		ctx,
		internalId: skipsRunId,
		updates: { status: MigrationRunStatus.Succeeded, finished_at: Date.now() },
	});

	const running = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-running",
		planId: plan.id,
	});
	const runningRunId = await seedRun({
		ctx,
		migrationInternalId: running.internal_id,
		status: MigrationRunStatus.Running,
	});
	for (const item of [a, b]) {
		await migrationItemRunRepo.claim({
			ctx,
			migrationInternalId: running.internal_id,
			migrationRunId: runningRunId,
			itemKind: item.kind,
			itemId: item.internal_id,
			claimBehavior: "claim_new",
		});
	}
	await withMigrationItemTracking({
		ctx,
		migrationInternalId: running.internal_id,
		migrationRunId: runningRunId,
		dryRun: false,
		claimItemRun: true,
		item: c,
		run: async () => ({
			itemPreview: preview(c),
			status: "succeeded" as const,
			response: {},
		}),
	});

	const waiting = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-waiting",
		planId: plan.id,
	});
	const waitingRunId = await seedRun({
		ctx,
		migrationInternalId: waiting.internal_id,
		status: MigrationRunStatus.Queued,
	});

	if (!KEEP_LIVE_RUNS) {
		for (const internalId of [runningRunId, waitingRunId]) {
			await migrationRunRepo.update({
				ctx,
				internalId,
				updates: {
					status: MigrationRunStatus.Canceled,
					finished_at: Date.now(),
				},
			});
		}
	}

	console.log(
		chalk.green(
			[
				"[migration-setup] qa-dry (Draft, dry-run rows), qa-skips (Run: guard, connection drop,",
				"no changes, failed, passed), qa-running (Running, a/b claimed, c passed),",
				KEEP_LIVE_RUNS
					? "qa-waiting (Waiting on qa-running). Cancel qa-running when finished."
					: "qa-waiting. Both seeded runs were settled; rerun with QA_KEEP_LIVE_RUNS=1 to keep them live.",
			].join("\n"),
		),
	);
});
