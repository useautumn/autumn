/**
 * Per-customer lane: skipped item runs carry a skip_reason.
 *
 * Contract:
 *   A customer the operation matched but had nothing to change for
 *   (the added item already exists)            → skipped, no_updates_needed
 *   A customer no operation could apply to
 *   (their plan is outside the op's plan_filter) → skipped, ineligible
 *   A changed customer                          → succeeded, skip_reason null
 *   The Tinybird event response carries the same skip_reason.
 *
 * `limit` keeps the run on the per-customer lane.
 */

import { test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectMigrationItemRunStatus } from "../batch-migrations/batchTestUtils.js";
import {
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "../utils/expectMigrationItemEvent.js";
import { runChunkedMigration } from "../utils/runChunkedMigration.js";

test.concurrent(
	`${chalk.yellowBright("per-customer skip reason: no_updates_needed vs ineligible")}`,
	async () => {
		const runSuffix = Date.now();
		const changedId = `pc-skip-changed-${runSuffix}`;
		const unchangedId = `pc-skip-unchanged-${runSuffix}`;
		const otherPlanId = `pc-skip-other-plan-${runSuffix}`;
		const targetPlan = products.base({ id: "pc-skip-target", items: [] });
		const otherPlan = products.base({ id: "pc-skip-other", items: [] });

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
					// Already has the dashboard → the op has nothing to change.
					s.billing.attach({
						customerId: unchangedId,
						productId: targetPlan.id,
						items: [items.dashboard()],
					}),
					// On a plan the op's plan_filter never matches.
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
			migrationId: "pc-skip-reason-mig",
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
			controls: { limit: 10 },
		});
		if (result?.lane !== "per_customer")
			throw new Error(`Expected the per-customer lane, got ${result?.lane}`);

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
			lane: null,
			skipReason: "no_updates_needed",
		});
		await expectMigrationItemEventCorrect({
			ctx,
			events,
			customerId: otherPlanId,
			status: "skipped",
			lane: null,
			skipReason: "ineligible",
		});
	},
);
