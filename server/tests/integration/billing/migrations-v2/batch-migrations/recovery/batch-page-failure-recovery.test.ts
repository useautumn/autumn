/**
 * A batch page that dies after some of its writes committed must not lose what
 * the migration changed: the customer stays retryable, gets no webhook while
 * half-applied, and the retry marks it succeeded with exactly one webhook.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import {
	expectBillingUpdatedCorrect,
	listBillingUpdatedWebhooks,
	waitForBillingUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import testCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import {
	expectMigrationItemRunStatus,
	getInternalCustomerId,
} from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import {
	runRecoveryMigration,
	updatePlanAddingItems,
} from "./utils/runRecoveryMigration.js";

const { pageFaults, enqueueFaults, restore } = await installPageFaults();

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
	`${chalk.yellowBright("batch recovery: a page that dies after its writes commit is retried to succeeded with one webhook")}`,
	async () => {
		const customerId = "batch-recovery-committed";
		const plan = products.base({ id: "batch-recovery-committed", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `batch-recovery-committed-${Date.now().toString(36)}`,
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

		pageFaults.set(plan.id, "after_add");
		const failedRun = await runRecoveryMigration({ ctx, migration });
		pageFaults.delete(plan.id);

		expect(String(failedRun.error)).toContain("injected");
		const afterFailure =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(afterFailure.balances[TestFeature.Workflows]?.remaining).toBe(10);
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId: failedRun.migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Failed,
		});

		const retry = await runRecoveryMigration({
			ctx,
			migration,
			retryFailed: true,
		});
		expect(retry.error).toBeUndefined();

		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId: retry.migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
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
						{
							action: "created",
							featureId: TestFeature.Workflows,
							included: 10,
						},
					],
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch recovery: a half-applied customer gets no webhook until the retry completes it, then one with every change")}`,
	async () => {
		const customerId = "batch-recovery-half";
		const basePlan = products.base({
			id: "batch-recovery-half-base",
			items: [],
		});
		const addOnPlan = products.base({
			id: "batch-recovery-half-addon",
			items: [],
			isAddOn: true,
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [basePlan, addOnPlan] }),
			],
			actions: [
				s.billing.attach({ productId: basePlan.id }),
				s.billing.attach({ productId: addOnPlan.id }),
			],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `batch-recovery-half-${Date.now().toString(36)}`,
			filter: { customer: { plan: { plan_id: basePlan.id } } },
			operations: {
				customer: [
					updatePlanAddingItems({
						planId: basePlan.id,
						addItems: [{ feature_id: TestFeature.Workflows, included: 10 }],
					}),
					updatePlanAddingItems({
						planId: addOnPlan.id,
						addItems: [itemsV2.dashboard()],
					}),
				],
			},
			no_billing_changes: true,
		});

		pageFaults.set(addOnPlan.id, "before_add");
		const failedRun = await runRecoveryMigration({ ctx, migration });
		pageFaults.delete(addOnPlan.id);

		expect(String(failedRun.error)).toContain("injected");
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId: failedRun.migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Failed,
		});
		expect(
			await waitForBillingUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				timeoutMs: 5_000,
			}),
		).toBeNull();

		const retry = await runRecoveryMigration({
			ctx,
			migration,
			retryFailed: true,
		});
		expect(retry.error).toBeUndefined();

		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId: retry.migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
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
					planId: basePlan.id,
					itemChanges: [
						{
							action: "created",
							featureId: TestFeature.Workflows,
							included: 10,
						},
					],
				},
				{
					planId: addOnPlan.id,
					itemChanges: [
						{ action: "created", featureId: TestFeature.Dashboard },
					],
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch recovery: a failure after the marks keeps the customer succeeded and the run's sweep publishes it once")}`,
	async () => {
		const customerId = "batch-recovery-after-marks";
		const plan = products.base({ id: "batch-recovery-after-marks", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `batch-recovery-after-marks-${Date.now().toString(36)}`,
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

		enqueueFaults.set(customerId, ["before_send"]);
		await runRecoveryMigration({ ctx, migration });

		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const [itemRun] = await ctx.db
			.select()
			.from(migrationItemRuns)
			.where(
				and(
					eq(migrationItemRuns.migration_internal_id, migration.internal_id),
					eq(migrationItemRuns.item_id, internalCustomerId),
				),
			);
		expect(itemRun.status).toBe(MigrationItemRunStatus.Succeeded);
		expect(itemRun.unpublished_changes).toBeNull();
		expect(
			await listBillingUpdatedWebhooks({
				playToken: webhook.playToken,
				customerId,
			}),
		).toHaveLength(1);
	},
);
