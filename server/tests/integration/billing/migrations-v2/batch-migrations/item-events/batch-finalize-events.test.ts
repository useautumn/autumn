/**
 * Batch finalize: Tinybird item events.
 *
 * Contract:
 *   - one event per claimed customer, succeeded AND skipped;
 *   - succeeded events carry a synthesized response — `lane: "batch"` plus a
 *     migration_customer_preview whose balance/flag/plan changes describe the
 *     rows this page inserted (the dedup guarantees the pre-state was empty);
 *   - skipped events carry the skip reason and no preview.
 *
 * Customer ids are run-unique: Tinybird is shared across worktrees and dev
 * instances, so deterministic ids would read back another run's events.
 * Assertions are skipped only when Tinybird isn't configured — an empty read
 * while configured stays a failure, never a silent pass.
 */

import { test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "../../utils/expectMigrationItemEvent";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "../batchTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch migration finalize: emits item events for succeeded and skipped")}`,
	async () => {
		const runSuffix = Date.now();
		const plainId = `batch-events-plain-${runSuffix}`;
		const customId = `batch-events-custom-${runSuffix}`;
		const freePlan = products.base({ id: "batch-events-free", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customId }]),
				s.products({ list: [freePlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: freePlan.id }),
					// Customized attach → batch-ineligible customer product → skipped.
					s.billing.attach({
						customerId: customId,
						productId: freePlan.id,
						items: [
						items.dashboard(),
						items.freeAllocatedWorkflows({ includedUsage: 25 }),
					],
					}),
				),
			],
		});

		const { migration, migrationRunId } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-events-mig",
			filter: { customer: { plan: { plan_id: freePlan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: freePlan.id },
						customize: {
							add_items: [
								itemsV2.dashboard(),
								{ feature_id: TestFeature.Workflows, included: 10 },
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		const run = {
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
		};
		await expectMigrationItemRunStatus({
			...run,
			customerId: plainId,
			status: MigrationItemRunStatus.Succeeded,
		});
		await expectMigrationItemRunStatus({
			...run,
			customerId: customId,
			status: MigrationItemRunStatus.Skipped,
		});

		const events = await getMigrationItemEvents({ ...run, expectedCount: 2 });
		if (!events) return;

		await expectMigrationItemEventCorrect({
			ctx,
			events,
			customerId: plainId,
			status: "succeeded",
			planChangeActions: ["updated"],
			// Regression: the dashboard names plans from this — "Unknown plan" when absent.
			planChangePlanIds: [freePlan.id],
			itemChangeCount: 2,
			balanceFeatureIds: [TestFeature.Workflows],
			createdFlagFeatureIds: [TestFeature.Dashboard],
		});

		await expectMigrationItemEventCorrect({
			ctx,
			events,
			customerId: customId,
			status: "skipped",
			reason: "no_batch_changes",
		});
	},
);
