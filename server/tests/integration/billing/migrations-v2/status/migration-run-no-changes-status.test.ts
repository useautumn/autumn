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
 * Red (current):  every case settles `succeeded`.
 * Green (after):  the all-skipped run settles `no_changes`.
 */

import { expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { runChunkedMigration } from "../utils/runChunkedMigration.js";

const runStatus = async ({
	ctx,
	migrationRunId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	migrationRunId: string;
}) => {
	const [run] = await migrationRunRepo.list({
		ctx,
		internalId: migrationRunId,
	});
	if (!run) throw new Error(`Run ${migrationRunId} not found`);
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

		const { migrationRunId } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "mig-no-changes",
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
			noBillingChanges: true,
			controls: { limit: 10 },
		});

		expect(await runStatus({ ctx, migrationRunId })).toBe(
			MigrationRunStatus.NoChanges,
		);
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

		const { migrationRunId } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "mig-some-changes",
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
			noBillingChanges: true,
			controls: { limit: 10 },
		});

		expect(await runStatus({ ctx, migrationRunId })).toBe(
			MigrationRunStatus.Succeeded,
		);
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
		const unmatchedPlanId = `${targetPlan.id}-absent`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [targetPlan] })],
			actions: [s.billing.attach({ productId: targetPlan.id })],
		});

		const { migrationRunId } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "mig-no-matches",
			filter: { customer: { plan: { plan_id: unmatchedPlanId } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: unmatchedPlanId },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			noBillingChanges: true,
			controls: { limit: 10 },
		});

		expect(await runStatus({ ctx, migrationRunId })).toBe(
			MigrationRunStatus.Succeeded,
		);
	},
);
