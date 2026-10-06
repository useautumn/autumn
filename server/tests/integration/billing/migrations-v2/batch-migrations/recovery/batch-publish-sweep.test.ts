/**
 * Changes whose publish failed stay on their settled item run, and the run's
 * sweep republishes them under the same Svix idempotency key: one delivery.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { MigrationItemRunStatus, migrationItemRuns } from "@autumn/shared";
import {
	listBillingUpdatedWebhooks,
	waitForBillingUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
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
import { settleLeftoverClaims } from "@/internal/migrations/v2/actions/migrationRun/settleLeftoverClaims.js";
import { getInternalCustomerId } from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import {
	computeBatchExecutionPlan,
	runRecoveryMigration,
	updatePlanAddingItems,
} from "./utils/runRecoveryMigration.js";

const { pageFaults, enqueueFaults, enqueueSends, restore } =
	await installPageFaults();

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

test.concurrent(
	`${chalk.yellowBright("batch publish sweep: a claim left running by a hard crash keeps its changes until a retry publishes them")}`,
	async () => {
		const customerId = "batch-sweep-hard-crash";
		const plan = products.base({ id: "batch-sweep-hard-crash", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `batch-sweep-hard-crash-${Date.now().toString(36)}`,
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
		const itemRunWhere = and(
			eq(migrationItemRuns.migration_internal_id, migration.internal_id),
			eq(migrationItemRuns.item_id, internalCustomerId),
		);
		const getItemRun = async () => {
			const [itemRun] = await ctx.db
				.select()
				.from(migrationItemRuns)
				.where(itemRunWhere);
			return itemRun;
		};

		pageFaults.set(plan.id, "after_add");
		const crashedRun = await runRecoveryMigration({ ctx, migration });
		pageFaults.delete(plan.id);

		// A hard crash never releases the claim: put it back to running.
		await ctx.db
			.update(migrationItemRuns)
			.set({
				status: MigrationItemRunStatus.Running,
				migration_run_id: crashedRun.migrationRunId,
			})
			.where(itemRunWhere);

		const { sweepUnpublishedChanges } = await import(
			"@/internal/migrations/v2/batchOperations/finalize/sweepUnpublishedChanges.js"
		);
		await sweepUnpublishedChanges({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId: crashedRun.migrationRunId,
			plan: await computeBatchExecutionPlan({ ctx, migration }),
			webhooks: {
				sendWebhooks: true,
				webhookConcurrency: 1,
				eventTypes: ["billing.updated"],
			},
		});
		const afterSweep = await getItemRun();
		expect(afterSweep.status).toBe(MigrationItemRunStatus.Running);
		expect(afterSweep.unpublished_changes).not.toBeNull();
		expect(
			await waitForBillingUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				timeoutMs: 5_000,
			}),
		).toBeNull();

		// The run-end settle releases it; the changes survive the release.
		await settleLeftoverClaims({
			ctx,
			migrationRunId: crashedRun.migrationRunId,
		});
		const afterSettle = await getItemRun();
		expect(afterSettle.status).toBe(MigrationItemRunStatus.Failed);
		expect(afterSettle.unpublished_changes).toEqual(
			afterSweep.unpublished_changes,
		);

		const retry = await runRecoveryMigration({
			ctx,
			migration,
			retryFailed: true,
		});
		expect(retry.error).toBeUndefined();
		const afterRetry = await getItemRun();
		expect(afterRetry.status).toBe(MigrationItemRunStatus.Succeeded);
		expect(afterRetry.unpublished_changes).toBeNull();
		expect(
			await listBillingUpdatedWebhooks({
				playToken: webhook.playToken,
				customerId,
			}),
		).toHaveLength(1);
	},
);
