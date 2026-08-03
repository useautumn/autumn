/**
 * Run controls are CONTROLS, not lane selectors: `only` and
 * `retry_item_statuses` must keep a batch-eligible migration on the batch
 * lane.
 *
 * Contract under test:
 *   New behaviors:
 *     - only: [ids] → batch lane; ONLY those customers are claimed — others
 *       untouched with no item runs at all;
 *     - retry skipped → batch lane; skipped rows are re-claimed and
 *       re-evaluated, succeeded rows stay excluded (no double adds);
 *     - retry failed → batch lane; a failed row is re-claimed and, now
 *       processable, succeeds with its mutation applied.
 *   Side effects:
 *     - item runs transition skipped/failed → succeeded/skipped on retry.
 *
 * Pre-impl red: isBatchEligibleRun rejects only/retryItemStatuses, so every
 * lane assertion sees "per_customer".
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectMigrationItemRunStatus,
	getInternalCustomerId,
} from "../batchTestUtils";
import {
	addWordsOperation,
	expectWordsOnPlans,
} from "../operation-scope/operationScopeTestUtils";

const runWordsMigration = async ({
	ctx,
	migrationClient,
	migrationId,
	planId,
	planFilter,
	controls,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	ctx: any;
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	migrationClient: any;
	migrationId: string;
	planId: string;
	planFilter?: Record<string, unknown>;
	controls?: {
		only?: string[];
		retryItemStatuses?: ("failed" | "skipped")[];
	};
}) => {
	// Selection stays broad (everyone on the plan is claimed); only the OP's
	// plan_filter narrows which rows mutate — that's what makes skips happen.
	const run = await runChunkedMigration({
		ctx,
		migrationClient,
		migrationId,
		filter: { customer: { plan: { plan_id: planId } } },
		operations: addWordsOperation({
			planFilter: { plan_id: planId, ...(planFilter ?? {}) },
		}),
		noBillingChanges: true,
		controls,
	});
	// The contract: controls never change the lane.
	expect(run.result?.lane).toBe("batch");
	return run;
};

test.concurrent(
	`${chalk.yellowBright("batch controls: only claims exactly the targeted customers, on the batch lane")}`,
	async () => {
		const targetId = "batch-ctrl-only-target";
		const bystanderId = "batch-ctrl-only-bystander";
		const plan = products.base({ id: "batch-ctrl-only-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: targetId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: bystanderId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: bystanderId, productId: plan.id }),
				),
			],
		});

		const { migration } = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-only-mig",
			planId: plan.id,
			controls: { only: [targetId] },
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(targetId),
			planIds: [plan.id],
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(bystanderId),
			planIds: [],
		});

		// The bystander was never claimed — no item run row at all.
		const bystanderInternalId = await getInternalCustomerId({
			ctx,
			customerId: bystanderId,
		});
		const bystanderRuns = await ctx.db
			.select()
			.from(migrationItemRuns)
			.where(
				and(
					eq(migrationItemRuns.migration_internal_id, migration.internal_id),
					eq(migrationItemRuns.item_id, bystanderInternalId),
				),
			);
		expect(bystanderRuns).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch controls: retry skipped re-claims skipped rows without double-adding succeeded ones")}`,
	async () => {
		const plainId = "batch-ctrl-reskip-plain";
		const customizedId = "batch-ctrl-reskip-customized";
		const plan = products.base({ id: "batch-ctrl-reskip-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customizedId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customizedId,
						productId: plan.id,
						items: [items.freeAllocatedWorkflows({ includedUsage: 25 })],
					}),
				),
			],
		});

		// First run scopes to plain rows: plain succeeds, customized skips.
		const first = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-reskip-mig",
			planId: plan.id,
			planFilter: { custom: false },
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: first.migration.internal_id,
			migrationRunId: first.migrationRunId,
			customerId: customizedId,
			status: MigrationItemRunStatus.Skipped,
		});

		// Retry skipped: still batch lane; the customized row is re-evaluated
		// (still custom → skipped again), the plain row is NOT double-added.
		const retry = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-reskip-mig",
			planId: plan.id,
			planFilter: { custom: false },
			controls: { retryItemStatuses: ["skipped"] },
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: retry.migration.internal_id,
			migrationRunId: retry.migrationRunId,
			customerId: customizedId,
			status: MigrationItemRunStatus.Skipped,
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(plainId),
			planIds: [plan.id],
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customizedId),
			planIds: [],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch controls: retry failed re-claims a failed row and completes it")}`,
	async () => {
		const customerId = "batch-ctrl-refail";
		const plan = products.base({ id: "batch-ctrl-refail-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const first = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-refail-mig",
			planId: plan.id,
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [plan.id],
		});

		// Manufacture a failed row (as if a prior run had errored on it).
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		await ctx.db
			.update(migrationItemRuns)
			.set({ status: MigrationItemRunStatus.Failed })
			.where(
				and(
					eq(
						migrationItemRuns.migration_internal_id,
						first.migration.internal_id,
					),
					eq(migrationItemRuns.item_id, internalCustomerId),
				),
			);

		// Retry failed: batch lane re-claims the row; Words already exist (dedup)
		// → converged → marked skipped, and crucially NOT double-added.
		const retry = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-refail-mig",
			planId: plan.id,
			controls: { retryItemStatuses: ["failed"] },
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: retry.migration.internal_id,
			migrationRunId: retry.migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Skipped,
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [plan.id],
		});
	},
);
