import { afterAll, expect, test } from "bun:test";
import { MigrationItemRunStatus, migrationItemRuns } from "@autumn/shared";
import {
	expectBillingUpdatedCorrect,
	listBillingUpdatedWebhooks,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq } from "drizzle-orm";
import { getInternalCustomerId } from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import { runRecoveryMigration } from "./utils/runRecoveryMigration.js";

const { removeFaults, restore } = await installPageFaults();
afterAll(restore);

test("explicit failed-item retry reaches a customer whose committed removal invalidated its filter", async () => {
	const customerId = "retry-selector-customer";
	const plan = products.base({
		id: "retry-selector-plan",
		items: [itemsV2.dashboard()],
	});
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
	try {
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `retry-selector-${Date.now().toString(36)}`,
			filter: {
				customer: {
					plan: {
						plan_id: plan.id,
						item: { feature_id: TestFeature.Dashboard },
					},
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: {
							remove_items: [{ feature_id: TestFeature.Dashboard }],
						},
					},
				],
			},
			no_billing_changes: true,
		});
		removeFaults.add(plan.id);
		const failed = await runRecoveryMigration({ ctx, migration });
		removeFaults.delete(plan.id);
		expect(String(failed.error)).toContain("injected");
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const read = async () => {
			const [row] = await ctx.db
				.select()
				.from(migrationItemRuns)
				.where(
					and(
						eq(migrationItemRuns.migration_internal_id, migration.internal_id),
						eq(migrationItemRuns.item_id, internalCustomerId),
					),
				);
			return row;
		};
		expect((await read()).status).toBe(MigrationItemRunStatus.Failed);
		const normalRun = await runRecoveryMigration({ ctx, migration });
		expect(normalRun.result?.processed).toBe(0);
		expect((await read()).status).toBe(MigrationItemRunStatus.Failed);
		expect((await read()).migration_run_id).toBe(failed.migrationRunId);
		const retry = await runRecoveryMigration({
			ctx,
			migration,
			retryFailed: true,
		});
		expect(retry.error).toBeUndefined();
		expect((await read()).status).toBe(MigrationItemRunStatus.Succeeded);
		expect((await read()).unpublished_changes).toBeNull();
		const deliveries = await listBillingUpdatedWebhooks({
			playToken: webhook.playToken,
			customerId,
		});
		expect(deliveries).toHaveLength(1);
		expectBillingUpdatedCorrect({
			data: deliveries[0],
			customerId,
			planChanges: [
				{
					planId: plan.id,
					itemChanges: [
						{ action: "deleted", featureId: TestFeature.Dashboard },
					],
				},
			],
		});
	} finally {
		removeFaults.delete(plan.id);
		await webhook.cleanup();
	}
});
