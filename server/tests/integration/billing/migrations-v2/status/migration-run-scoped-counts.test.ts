/**
 * The progress bar on a scoped run (single customer or sample) must count only
 * that run's customers. `/migrations.runs.list` returned one migration-wide
 * live count for every non-dry run, so a second single-customer run reported
 * the total of every live run ever: the bar read "2 of 1".
 *
 * Contract:
 *   only_ids run      → item_run_counts covers just those ids
 *   target_limit run  → counts cover at most the limit
 *   unscoped Run All  → keeps the migration-wide count, so a resumed run that
 *                       reuses item rows is not undercounted
 *
 * Red (current):  the second scoped run reports total 2.
 * Green (after):  it reports total 1.
 */

import { expect, test } from "bun:test";
import { isTerminalMigrationRunStatus } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { clearMigrationRunHistory } from "../utils/runChunkedMigration.js";
import { waitForMigrationResult } from "../utils/runUpdatePlanMigration.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type ScenarioClient = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

const RUN_ID = Date.now().toString(36);
const CUSTOMER_IDS = ["a", "b", "c"].map(
	(suffix) => `scoped-counts-${RUN_ID}-${suffix}`,
);

const runAndWait = async ({
	ctx,
	autumn,
	migrationId,
	only,
	limit,
}: {
	ctx: ScenarioCtx;
	autumn: ScenarioClient;
	migrationId: string;
	only?: string[];
	limit?: number;
}) => {
	const { run_id } = await autumn.migrationsV2.run({
		id: migrationId,
		dry_run: false,
		...(only && { only }),
		...(limit && { limit }),
	});
	await waitForMigrationResult({
		timeoutMs: 120_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [row] = await migrationRunRepo.list({ ctx, internalId: run_id });
			if (!row) throw new Error("Run not found");
			if (!isTerminalMigrationRunStatus(row.status))
				throw new Error(`Run still ${row.status}`);
		},
	});
	return run_id;
};

const countsForRun = async ({
	autumn,
	migrationId,
	runId,
}: {
	autumn: ScenarioClient;
	migrationId: string;
	runId: string;
}) => {
	const { list } = await autumn.migrationsV2.listRuns({ migrationId });
	const run = list.find((candidate) => candidate.internal_id === runId);
	if (!run) throw new Error(`Run ${runId} missing from runs.list`);
	return run.item_run_counts;
};

test(`${chalk.yellowBright("scoped run counts: each scoped run reports only its own customers")}`, async () => {
	const plan = products.base({ id: `scoped-counts-${RUN_ID}`, items: [] });
	const [firstId, ...otherIds] = CUSTOMER_IDS;
	const migrationId = `scoped-counts-mig-${Date.now()}`;

	const { autumnV2_2, ctx } = await initScenario({
		customerId: firstId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherIds.map((id) => ({ id }))),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				...CUSTOMER_IDS.map((customerId) =>
					s.billing.attach({ customerId, productId: plan.id }),
				),
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
		no_billing_changes: true,
	});

	const firstRun = await runAndWait({
		ctx,
		autumn: autumnV2_2,
		migrationId,
		only: [CUSTOMER_IDS[0]],
	});
	expect(
		(await countsForRun({ autumn: autumnV2_2, migrationId, runId: firstRun }))
			.total,
	).toBe(1);

	// A different customer: the migration now has two live item runs, but this
	// run still covers exactly one.
	const secondRun = await runAndWait({
		ctx,
		autumn: autumnV2_2,
		migrationId,
		only: [CUSTOMER_IDS[1]],
	});
	expect(
		(await countsForRun({ autumn: autumnV2_2, migrationId, runId: secondRun }))
			.total,
	).toBe(1);

	// The earlier run's own numbers are unchanged by the later one.
	expect(
		(await countsForRun({ autumn: autumnV2_2, migrationId, runId: firstRun }))
			.total,
	).toBe(1);

	// A sample run is scoped the same way, by target_limit rather than ids.
	const sampleRun = await runAndWait({
		ctx,
		autumn: autumnV2_2,
		migrationId,
		limit: 2,
	});
	const sampleCounts = await countsForRun({
		autumn: autumnV2_2,
		migrationId,
		runId: sampleRun,
	});
	expect(sampleCounts.total).toBeLessThanOrEqual(2);
	expect(sampleCounts.total).toBeGreaterThan(0);
});
