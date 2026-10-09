import { afterAll, expect, test } from "bun:test";
import { MigrationItemRunStatus, migrationItemRuns } from "@autumn/shared";
import { listBillingUpdatedWebhooks } from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq } from "drizzle-orm";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { clearPublishedItemRunChanges } from "@/internal/migrations/v2/batchOperations/execute/claim/clearPublishedItemRunChanges.js";
import { publishBatchMigrationChanges } from "@/internal/migrations/v2/batchOperations/finalize/publishBatchMigrationChanges.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import { getInternalCustomerId } from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import {
	runRecoveryMigration,
	updatePlanAddingItems,
} from "./utils/runRecoveryMigration.js";

const { pageFaults, enqueueFaults, restore } = await installPageFaults();
afterAll(restore);

test("a stale publisher leaves the retry's added changes to be published once", async () => {
	const customerId = "stale-publish-customer";
	const base = products.base({ id: "stale-publish-base", items: [] });
	const addon = products.base({
		id: "stale-publish-addon",
		items: [],
		isAddOn: true,
	});
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [base, addon] }),
		],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.billing.attach({ productId: addon.id }),
		],
	});
	const webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
	try {
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `stale-publish-${Date.now().toString(36)}`,
			filter: { customer: { plan: { plan_id: base.id } } },
			operations: {
				customer: [
					updatePlanAddingItems({
						planId: base.id,
						addItems: [{ feature_id: TestFeature.Workflows, included: 10 }],
					}),
					updatePlanAddingItems({
						planId: addon.id,
						addItems: [itemsV2.dashboard()],
					}),
				],
			},
			no_billing_changes: true,
		});
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const where = and(
			eq(migrationItemRuns.migration_internal_id, migration.internal_id),
			eq(migrationItemRuns.item_id, internalCustomerId),
		);
		const read = async () => {
			const [row] = await ctx.db.select().from(migrationItemRuns).where(where);
			return row;
		};
		pageFaults.set(addon.id, "before_add");
		await runRecoveryMigration({ ctx, migration });
		pageFaults.delete(addon.id);
		await ctx.db
			.update(migrationItemRuns)
			.set({ status: MigrationItemRunStatus.Skipped })
			.where(where);
		const oldSnapshot = await read();
		expect(oldSnapshot.unpublished_changes).toHaveLength(1);

		await ctx.db
			.update(migrationItemRuns)
			.set({ status: MigrationItemRunStatus.Failed })
			.where(where);
		enqueueFaults.set(customerId, ["before_send", "before_send"]);
		await runRecoveryMigration({ ctx, migration, retryFailed: true });
		enqueueFaults.delete(customerId);
		const retrySnapshot = await read();
		expect(retrySnapshot.status).toBe(MigrationItemRunStatus.Succeeded);
		expect(retrySnapshot.unpublished_changes).toHaveLength(2);
		const oldClear = {
			db: ctx.db,
			migrationInternalId: migration.internal_id,
			internalCustomerIds: [internalCustomerId],
			publishedSnapshots: [
				{
					internalCustomerId,
					migrationRunId: oldSnapshot.migration_run_id,
					changes: oldSnapshot.unpublished_changes,
				},
			],
		};
		await clearPublishedItemRunChanges(oldClear);
		expect((await read()).unpublished_changes).toEqual(
			retrySnapshot.unpublished_changes,
		);

		const lane = await shouldRunBatchLane({
			ctx,
			migration: await prepareMigration({ ctx, migration, dryRun: false }),
			migrationRunId: generateId("mrun"),
			dryRun: false,
			controls: undefined,
			hasCustomHooks: false,
			hasCloudBatchAdapter: false,
		});
		if (!lane.shouldRun) throw new Error("expected a batch migration");
		if (!retrySnapshot.migration_run_id)
			throw new Error("missing retry run id");
		await publishBatchMigrationChanges({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId: retrySnapshot.migration_run_id,
			plan: batchMigrationPlanToExecutionPlan({ plan: lane.plan }),
			internalCustomerIds: [internalCustomerId],
			webhooks: {
				sendWebhooks: true,
				webhookConcurrency: 1,
				eventTypes: ["billing.updated"],
			},
		});
		expect((await read()).unpublished_changes).toBeNull();
		const delivered = await listBillingUpdatedWebhooks({
			playToken: webhook.playToken,
			customerId,
		});
		expect(delivered).toHaveLength(1);
		expect(delivered[0].plan_changes).toHaveLength(2);
	} finally {
		pageFaults.delete(addon.id);
		await webhook.cleanup();
	}
});
