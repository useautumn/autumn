/**
 * Batch lane: skipped item runs carry a skip_reason.
 *
 * Contract:
 *   A claimed customer with a product inside the patch scope that already
 *   converged (the added item exists)           → skipped, no_updates_needed
 *   A claimed customer with no product in any
 *   patch scope (their plan is out of the op)   → skipped, ineligible
 *   A changed customer                          → succeeded, skip_reason null
 *   The Tinybird event carries skip_reason next to the legacy reason.
 */

import { test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "../../utils/expectMigrationItemEvent.js";
import { runChunkedMigration } from "../../utils/runChunkedMigration.js";
import { expectMigrationItemRunStatus } from "../batchTestUtils.js";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("batch skip reason: no_updates_needed vs ineligible")}`,
	async () => {
		const runSuffix = Date.now();
		const changedId = `batch-skip-changed-${runSuffix}`;
		const unchangedId = `batch-skip-unchanged-${runSuffix}`;
		const otherPlanId = `batch-skip-other-plan-${runSuffix}`;
		const targetPlan = products.base({ id: "batch-skip-target", items: [] });
		const otherPlan = products.base({ id: "batch-skip-other", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: changedId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: unchangedId }, { id: otherPlanId }]),
				s.products({ list: [targetPlan, otherPlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: targetPlan.id }),
					s.billing.attach({
						customerId: unchangedId,
						productId: targetPlan.id,
						items: [items.dashboard()],
					}),
					s.billing.attach({
						customerId: otherPlanId,
						productId: otherPlan.id,
					}),
				),
			],
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-skip-reason-mig",
			filter: {
				customer: {
					plan: { plan_id: { $in: [targetPlan.id, otherPlan.id] } },
				},
			},
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
		});
		expectBatchLane({ result });

		const run = {
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
		};
		await expectMigrationItemRunStatus({
			...run,
			customerId: changedId,
			status: MigrationItemRunStatus.Succeeded,
			skipReason: null,
		});
		await expectMigrationItemRunStatus({
			...run,
			customerId: unchangedId,
			status: MigrationItemRunStatus.Skipped,
			skipReason: "no_updates_needed",
		});
		await expectMigrationItemRunStatus({
			...run,
			customerId: otherPlanId,
			status: MigrationItemRunStatus.Skipped,
			skipReason: "ineligible",
		});

		const events = await getMigrationItemEvents({ ...run, expectedCount: 3 });
		if (!events) return;

		await expectMigrationItemEventCorrect({
			ctx,
			events,
			customerId: unchangedId,
			status: "skipped",
			reason: "no_batch_changes",
			skipReason: "no_updates_needed",
		});
		await expectMigrationItemEventCorrect({
			ctx,
			events,
			customerId: otherPlanId,
			status: "skipped",
			reason: "no_batch_changes",
			skipReason: "ineligible",
		});
	},
);
