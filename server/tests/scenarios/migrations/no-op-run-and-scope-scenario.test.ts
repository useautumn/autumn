/**
 * QA seed for the two follow-ups: no-op run status, and the scoped progress
 * denominator. Not an assertion suite — it leaves state on the dev org to look
 * at in the dashboard.
 *
 * Seeds three migrations:
 *   qa-nochanges  every customer already converged → Run All settles
 *                 `no_changes`, footer reads "Run complete, no changes"
 *   qa-changes    one customer needs the change    → settles `succeeded`
 *   qa-scope      left as a draft with 6 matching customers, so you can Run
 *                 Sample / run a single customer and watch the progress
 *                 denominator follow the run's scope rather than reading 6
 *
 * Run with:
 *   bun test --timeout 300000 server/tests/scenarios/migrations/no-op-run-and-scope-scenario.test.ts
 */

import { test } from "bun:test";
import { isTerminalMigrationRunStatus } from "@autumn/shared";
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
				// Already carry the dashboard, so the operation has nothing to do.
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

	// The same operation over customers that do need it, for contrast.
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

	// Left as a draft: run a sample or a single customer from the dashboard
	// and watch the progress denominator.
	const scope = await createMigration({
		ctx,
		autumn: autumnV2_2,
		migrationId: "qa-scope",
		planId: scopePlan.id,
	});

	console.log(
		[
			"",
			chalk.bold("QA seed ready"),
			`  qa-nochanges  run settled: ${chalk.yellowBright(noChangesStatus)}  (expect no_changes)`,
			`  qa-changes    run settled: ${chalk.yellowBright(changesStatus)}  (expect succeeded)`,
			`  qa-scope      draft over ${SCOPE_IDS.length} customers — id ${scope.id}`,
			"",
			"  Scoped-progress check: open qa-scope, Run Sample with limit 2,",
			"  and confirm the footer reads '… of 2', not '… of 6'.",
			"",
		].join("\n"),
	);
});
