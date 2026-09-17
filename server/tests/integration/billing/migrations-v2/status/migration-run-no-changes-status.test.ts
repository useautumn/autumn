/**
 * A live run that completed but changed nothing was reported as `succeeded`,
 * so a mis-targeted migration was indistinguishable from one that really
 * migrated customers.
 *
 * Contract:
 *   every item skipped                  → run.status "no_changes"
 *   at least one item succeeded         → run.status "succeeded"
 *   a run that claimed no items at all  → run.status "succeeded"
 *
 * Runs go through /migrations.run so the run row is claimed and tracked the
 * way production does it; the direct in-process runner never inserts one.
 *
 * Red (current):  every case settles `succeeded`.
 * Green (after):  the all-skipped run settles `no_changes`.
 */

import { expect, test } from "bun:test";
import {
	isTerminalMigrationRunStatus,
	MigrationRunStatus,
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

/** Runs the migration through the API and returns the settled run status. */
const runAndSettle = async ({
	ctx,
	migrationClient,
	migrationId,
	planId,
}: {
	ctx: ScenarioCtx;
	migrationClient: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	migrationId: string;
	planId: string;
}) => {
	await clearMigrationRunHistory({ ctx, migrationId });
	const migration = await migrationClient.migrationsV2.deleteAndCreate({
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

	const { run_id } = await migrationClient.migrationsV2.run({
		id: migration.id,
		dry_run: false,
	});

	await waitForMigrationResult({
		timeoutMs: 90_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({ ctx, internalId: run_id });
			if (!run) throw new Error(`Run ${run_id} not found`);
			if (!isTerminalMigrationRunStatus(run.status))
				throw new Error(`Run still ${run.status}`);
		},
	});

	const [run] = await migrationRunRepo.list({ ctx, internalId: run_id });
	return run.status;
};

test.concurrent(
	`${chalk.yellowBright("migration run status: a run that skips everything is no_changes")}`,
	async () => {
		const customerId = `mig-no-changes-${Date.now()}`;
		const targetPlan = products.base({
			id: "mig-no-changes-target",
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [targetPlan] })],
			actions: [
				// Already has the dashboard, so the operation has nothing to change.
				s.billing.attach({
					productId: targetPlan.id,
					items: [items.dashboard()],
				}),
			],
		});

		expect(
			await runAndSettle({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: `${customerId}-mig`,
				planId: targetPlan.id,
			}),
		).toBe(MigrationRunStatus.NoChanges);
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run status: one real change keeps the run succeeded")}`,
	async () => {
		const changedId = `mig-some-changes-${Date.now()}`;
		const unchangedId = `${changedId}-unchanged`;
		const targetPlan = products.base({
			id: "mig-some-changes-target",
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

		expect(
			await runAndSettle({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: `${changedId}-mig`,
				planId: targetPlan.id,
			}),
		).toBe(MigrationRunStatus.Succeeded);
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run status: matching no customers is still succeeded")}`,
	async () => {
		const customerId = `mig-no-matches-${Date.now()}`;
		const targetPlan = products.base({
			id: "mig-no-matches-target",
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [targetPlan] })],
			actions: [s.billing.attach({ productId: targetPlan.id })],
		});

		expect(
			await runAndSettle({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: `${customerId}-mig`,
				planId: `${targetPlan.id}-absent`,
			}),
		).toBe(MigrationRunStatus.Succeeded);
	},
);
