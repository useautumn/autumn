/**
 * Filter-mode batch remove stamps each customer's live from-definition onto
 * item_changes and webhooks — not catalog ids[0].
 *
 * Contract:
 *   customerA live 100/mo, customerB live 200/mo
 *   after batch remove, each customer's item_changes / billing.updated carries
 *   THAT customer's from allowance (100 vs 200)
 *   a customize-attach (custom product) is still skipped by custom: false
 *
 * Red (catalog ids[0]): customerB deleted.included = 100
 * Green: 100 vs 200
 */
import { afterAll, beforeAll, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	expectBillingUpdatedAbsent,
	waitForBillingUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import { waitForProductsUpdatedWebhook } from "@tests/integration/billing/autumn-webhooks/utils/expectProductsUpdatedWebhook";
import { expectBatchLane } from "@tests/integration/billing/migrations-v2/batch-migrations/version-repoint/utils/versionRepointTestUtils";
import { expectFilterLiveDefinitionCorrect } from "@tests/integration/billing/migrations-v2/utils/expectFilterLiveDefinitionCorrect";
import {
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "@tests/integration/billing/migrations-v2/utils/expectMigrationItemEvent";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated", "customer.products.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(
	`${chalk.yellowBright("batch delete item events: each customer's live from-definition is stamped on item_changes")}`,
	async () => {
		const suffix = Date.now();
		const customerA = `batch-delete-live-100-${suffix}`;
		const customerB = `batch-delete-live-200-${suffix}`;
		const skippedCustomerId = `batch-delete-live-skipped-${suffix}`;
		const cases = [
			{ customerId: customerA, fromIncluded: 100 },
			{ customerId: customerB, fromIncluded: 200 },
		];

		const plan = products.base({
			id: `batch-delete-live-plan-${suffix}`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.dashboard(),
			],
		});
		const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
			customerId: customerA,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.otherCustomers([
					{ id: customerB },
					{ id: skippedCustomerId },
				]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customerB,
						productId: plan.id,
					}),
					s.billing.attach({
						customerId: skippedCustomerId,
						productId: plan.id,
						items: [
							items.monthlyMessages({ includedUsage: 50 }),
							items.dashboard(),
						],
					}),
				),
			],
		});

		await repointToCustomEntitlement({
			ctx: scenarioCtx,
			customerId: customerB,
			featureId: TestFeature.Messages,
			overrides: { allowance: 200 },
		});
		await setScopedFeatureBalance({
			ctx: scenarioCtx,
			customerId: customerB,
			featureId: TestFeature.Messages,
			balance: 200,
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_3,
			migrationId: `batch-delete-live-migration-${suffix}`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: ResetInterval.Month,
								},
								{ feature_id: TestFeature.Dashboard },
							],
						},
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expectBatchLane({ result });

		const run = {
			ctx: scenarioCtx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
		};
		const eventsPromise = getMigrationItemEvents({
			...run,
			expectedCount: 3,
		});
		const skippedPromise = waitForBillingUpdatedWebhook({
			playToken: webhook.playToken,
			customerId: skippedCustomerId,
			timeoutMs: 4_000,
		});
		const deliveredPromise = Promise.all(
			cases.map(async (row) => {
				const [billingUpdated, productsUpdated] = await Promise.all([
					waitForBillingUpdatedWebhook({
						playToken: webhook.playToken,
						customerId: row.customerId,
						entityId: null,
					}),
					waitForProductsUpdatedWebhook({
						playToken: webhook.playToken,
						customerId: row.customerId,
						scenario: "new",
						entityId: null,
						absentFeatureIds: [
							TestFeature.Messages,
							TestFeature.Dashboard,
						],
					}),
				]);
				return { ...row, billingUpdated, productsUpdated };
			}),
		);
		const [events, skippedBillingUpdated, delivered] = await Promise.all([
			eventsPromise,
			skippedPromise,
			deliveredPromise,
		]);

		expectBillingUpdatedAbsent({ data: skippedBillingUpdated });
		if (events) {
			await expectMigrationItemEventCorrect({
				ctx: scenarioCtx,
				events,
				customerId: skippedCustomerId,
				status: "skipped",
				reason: "no_batch_changes",
			});
		}

		for (const row of delivered) {
			await expectFilterLiveDefinitionCorrect({
				ctx: scenarioCtx,
				events,
				billingUpdated: row.billingUpdated,
				productsUpdated: row.productsUpdated,
				customerId: row.customerId,
				planId: plan.id,
				itemChanges: [
					{
						action: "deleted",
						featureId: TestFeature.Messages,
						included: row.fromIncluded,
					},
					{ action: "deleted", featureId: TestFeature.Dashboard },
				],
				absentFeatureIds: [TestFeature.Messages, TestFeature.Dashboard],
				flagChanges: [
					{ action: "deleted", featureId: TestFeature.Dashboard },
				],
			});
		}
	},
);
