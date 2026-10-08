import { expect, test } from "bun:test";
import {
	isTerminalMigrationRunStatus,
	type MigrationListSummary,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { clearMigrationRunHistory } from "../utils/runChunkedMigration.js";
import { waitForMigrationResult } from "../utils/runUpdatePlanMigration.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type MigrationClient = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

const runAndSettle = async ({
	ctx,
	migrationClient,
	migrationId,
	dryRun,
}: {
	ctx: ScenarioCtx;
	migrationClient: MigrationClient;
	migrationId: string;
	dryRun: boolean;
}) => {
	const { run_id } = await migrationClient.migrationsV2.run({
		id: migrationId,
		dry_run: dryRun,
	});
	await waitForMigrationResult({
		timeoutMs: 90_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({ ctx, internalId: run_id });
			if (!run || !isTerminalMigrationRunStatus(run.status))
				throw new Error(`Run ${run_id} still ${run?.status}`);
		},
	});
};

const listedSummary = async ({
	migrationClient,
	migrationId,
}: {
	migrationClient: MigrationClient;
	migrationId: string;
}): Promise<MigrationListSummary> => {
	const { list } = await migrationClient.migrationsV2.list();
	const migration = list.find((candidate) => candidate.id === migrationId);
	if (!migration) throw new Error(`${migrationId} missing from list`);
	return migration.summary;
};

test(`${chalk.yellowBright("migration list summary: dry run then run all report their counts")}`, async () => {
	const changedId = "mig-list-summary";
	const unchangedId = `${changedId}-unchanged`;
	const targetPlan = products.base({
		id: "mig-list-summary-target",
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId: changedId,
		setup: [
			s.customer(),
			s.otherCustomers([{ id: unchangedId }]),
			s.products({ list: [targetPlan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: targetPlan.id }),
				s.billing.attach({
					customerId: unchangedId,
					productId: targetPlan.id,
					items: [items.dashboard()],
				}),
			),
		],
	});

	const migrationId = `${changedId}-mig`;
	await clearMigrationRunHistory({ ctx, migrationId });
	await autumnV2_2.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter: { customer: { plan: { plan_id: targetPlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: targetPlan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
		no_billing_changes: true,
	});

	const draft = await listedSummary({
		migrationClient: autumnV2_2,
		migrationId,
	});
	expect(draft).toMatchObject({
		customer_count: 2,
		latest_run: null,
		latest_dry_run: null,
		latest_sample: null,
		queue_position: null,
	});

	const { list: withoutCounts } = await autumnV2_2.migrationsV2.list({
		customer_counts: false,
	});
	const { list: customerCounts } =
		await autumnV2_2.migrationsV2.customerCounts();
	expect(
		withoutCounts.find((candidate) => candidate.id === migrationId)?.summary,
	).toEqual({ ...draft, customer_count: null });
	expect(
		customerCounts.find((candidate) => candidate.id === migrationId),
	).toEqual({ id: migrationId, customer_count: 2 });

	await runAndSettle({
		ctx,
		migrationClient: autumnV2_2,
		migrationId,
		dryRun: true,
	});
	const dryRun = await listedSummary({
		migrationClient: autumnV2_2,
		migrationId,
	});
	expect(dryRun.latest_dry_run).toMatchObject({
		previewed: 2,
		would_change: 1,
		would_fail: 0,
	});
	expect(dryRun.latest_run).toBeNull();
	expect(dryRun.last_activity.kind).toBe("dry_run");

	await runAndSettle({
		ctx,
		migrationClient: autumnV2_2,
		migrationId,
		dryRun: false,
	});
	const ran = await listedSummary({ migrationClient: autumnV2_2, migrationId });
	expect(ran.latest_run).toMatchObject({
		status: "succeeded",
		error_message: null,
		counts: {
			total: 2,
			running: 0,
			succeeded: 1,
			no_updates_needed: 1,
			ineligible: 0,
			failed: 0,
		},
	});
	expect(ran.last_activity.kind).toBe("finished");
});
