/**
 * Batch remove finalization must describe the same deleted plan items in the
 * migration event and billing.updated, while products.updated shows post-state.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	expectBillingUpdatedCorrect,
	waitForBillingUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import {
	expectProductsUpdatedCorrect,
	waitForProductsUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectProductsUpdatedWebhook";
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
	expectMigrationEventBillingPlanChangesEqual,
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "../../utils/expectMigrationItemEvent";
import { runChunkedMigration } from "../../utils/runChunkedMigration";

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

test(`${chalk.yellowBright("batch delete item events: event and webhooks share the deleted item diff")}`, async () => {
	const suffix = Date.now();
	const customerId = `batch-delete-events-${suffix}`;
	const skippedCustomerId = `batch-delete-events-skipped-${suffix}`;
	const plan = products.base({
		id: `batch-delete-events-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 }), items.dashboard()],
	});
	const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.otherCustomers([{ id: skippedCustomerId }]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: plan.id }),
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

	const { migration, migrationRunId, result } = await runChunkedMigration({
		ctx: scenarioCtx,
		migrationClient: autumnV2_3,
		migrationId: `batch-delete-events-migration-${suffix}`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [
							{ feature_id: TestFeature.Messages },
							{ feature_id: TestFeature.Dashboard },
						],
					},
				},
			],
		},
		noBillingChanges: true,
		controls: { webhooks: { sendWebhooks: true } },
	});
	expect(result?.lane).toBe("batch");

	const run = {
		ctx: scenarioCtx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
	};
	const [events, billingUpdated, productsUpdated, skippedBillingUpdated] =
		await Promise.all([
			getMigrationItemEvents({ ...run, expectedCount: 2 }),
			waitForBillingUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				entityId: null,
			}),
			waitForProductsUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				scenario: "new",
				entityId: null,
				absentFeatureIds: [TestFeature.Messages, TestFeature.Dashboard],
			}),
			waitForBillingUpdatedWebhook({
				playToken: webhook.playToken,
				customerId: skippedCustomerId,
				timeoutMs: 4_000,
			}),
		]);

	expectBillingUpdatedCorrect({
		data: billingUpdated,
		customerId,
		entityId: null,
		planChanges: [
			{
				planId: plan.id,
				itemChanges: [
					{ action: "deleted", featureId: TestFeature.Messages, included: 100 },
					{ action: "deleted", featureId: TestFeature.Dashboard },
				],
			},
		],
	});
	expectProductsUpdatedCorrect({
		data: productsUpdated,
		customerId,
		planId: plan.id,
		entityId: null,
		absentFeatureIds: [TestFeature.Messages, TestFeature.Dashboard],
	});
	expect(skippedBillingUpdated).toBeNull();

	if (!events) return;
	await expectMigrationItemEventCorrect({
		ctx: scenarioCtx,
		events,
		customerId,
		status: "succeeded",
		planChangeActions: ["updated"],
		planChangePlanIds: [plan.id],
		itemChangeCount: 2,
		balanceFeatureIds: [],
		flagChanges: [{ action: "deleted", featureId: TestFeature.Dashboard }],
	});
	await expectMigrationEventBillingPlanChangesEqual({
		ctx: scenarioCtx,
		events,
		customerId,
		billingUpdated,
	});
	await expectMigrationItemEventCorrect({
		ctx: scenarioCtx,
		events,
		customerId: skippedCustomerId,
		status: "skipped",
		reason: "no_batch_changes",
	});
});
