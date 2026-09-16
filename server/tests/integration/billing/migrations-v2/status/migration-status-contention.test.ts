/**
 * Two Run Alls in one org through the real dispatch path. Trigger serializes
 * them on the org concurrency key, so the second migration reads `waiting`
 * (blocked_by the first) until the first finishes executing, then runs.
 *
 * Both are dispatched back to back; the waiter must read `waiting` at some
 * point while the blocker's trigger run executes. Cloud workers run trigger
 * tasks inline with no queue, so the test is skipped there.
 */

import { test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline.js";
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
		timeoutMs: 180_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({ ctx, internalId: runId });
			if (run?.status !== MigrationRunStatus.Succeeded)
				throw new Error(`Run still ${run?.status}`);
		},
	});

test.skipIf(shouldRunTriggerTasksInline())(
	`${chalk.yellowBright("migration status contention: a Run All dispatched behind another migration waits, then runs")}`,
	async () => {
		const customerId = "mig-status-contention";
		const blockerId = `${customerId}-blocker`;
		const waiterId = `${customerId}-waiter`;
		const blockedCustomerIds = Array.from(
			{ length: 12 },
			(_, index) => `${customerId}-${index}`,
		);
		const plan = products.base({
			id: `${customerId}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(blockedCustomerIds.map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				...blockedCustomerIds.map((id) =>
					s.billing.attach({ customerId: id, productId: plan.id }),
				),
			],
		});
		await autumnV1.products.update(plan.id, {
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		await clearMigrationRunHistory({ ctx, migrationId: blockerId });
		await clearMigrationRunHistory({ ctx, migrationId: waiterId });
		await autumnV2_2.migrationsV2.deleteAndCreate({
			id: blockerId,
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
		await autumnV2_2.migrationsV2.deleteAndCreate({
			id: waiterId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [{ feature_id: "dashboard" }] },
					},
				],
			},
			no_billing_changes: true,
		});

		const blockerRun = await autumnV2_2.migrationsV2.run({
			id: blockerId,
			dry_run: false,
		});
		const waiterRun = await autumnV2_2.migrationsV2.run({
			id: waiterId,
			dry_run: false,
		});
		await waitForMigrationResult({
			timeoutMs: 30_000,
			pollIntervalMs: 200,
			waitFor: () =>
				expectMigrationStatusCorrect({
					autumn: autumnV2_2,
					migrationId: waiterId,
					status: "waiting",
					blockedBy: blockerId,
				}),
		});

		await waitForRunFinished({ ctx, runId: blockerRun.run_id });
		await waitForRunFinished({ ctx, runId: waiterRun.run_id });
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId: blockerId,
			status: "run",
			blockedBy: null,
		});
		await expectMigrationStatusCorrect({
			autumn: autumnV2_2,
			migrationId: waiterId,
			status: "run",
			blockedBy: null,
		});
	},
);
