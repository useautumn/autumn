/**
 * Changes whose publish failed stay on their settled item run, and the run's
 * sweep republishes them under the same Svix idempotency key: one delivery.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { MigrationItemRunStatus, migrationItemRuns } from "@autumn/shared";
import { listBillingUpdatedWebhooks } from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import testCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { getInternalCustomerId } from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import {
	runRecoveryMigration,
	updatePlanAddingItems,
} from "./utils/runRecoveryMigration.js";

const { enqueueFaults, enqueueSends, restore } = await installPageFaults();

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: testCtx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
	restore();
});

test.concurrent(
	`${chalk.yellowBright("batch publish sweep: a publish that failed after sending is republished once, under the same key")}`,
	async () => {
		const customerId = "batch-sweep-republish";
		const plan = products.base({ id: "batch-sweep-republish", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `batch-sweep-republish-${Date.now().toString(36)}`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					updatePlanAddingItems({
						planId: plan.id,
						addItems: [{ feature_id: TestFeature.Workflows, included: 10 }],
					}),
				],
			},
			no_billing_changes: true,
		});
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const getItemRun = async () => {
			const [itemRun] = await ctx.db
				.select()
				.from(migrationItemRuns)
				.where(
					and(
						eq(migrationItemRuns.migration_internal_id, migration.internal_id),
						eq(migrationItemRuns.item_id, internalCustomerId),
					),
				);
			return itemRun;
		};

		// The page's publish sends then fails; the run's own sweep fails too.
		enqueueFaults.set(customerId, ["after_send", "before_send"]);
		await runRecoveryMigration({ ctx, migration });

		const afterFailedPublish = await getItemRun();
		expect(afterFailedPublish.status).toBe(MigrationItemRunStatus.Succeeded);
		expect(afterFailedPublish.unpublished_changes).not.toBeNull();

		// The next run's sweep republishes the pending changes.
		await runRecoveryMigration({ ctx, migration });

		const afterSweep = await getItemRun();
		expect(afterSweep.status).toBe(MigrationItemRunStatus.Succeeded);
		expect(afterSweep.unpublished_changes).toBeNull();
		expect(enqueueSends.get(customerId)).toBe(2);
		expect(
			await listBillingUpdatedWebhooks({
				playToken: webhook.playToken,
				customerId,
			}),
		).toHaveLength(1);
	},
);
