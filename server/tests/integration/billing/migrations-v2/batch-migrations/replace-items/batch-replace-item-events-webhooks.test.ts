/**
 * Batch replace finalization must report the canonical deleted-old then
 * created-new pair in both event and webhook, with usage preserved in preview.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import {
	expectBillingUpdatedCorrect,
	waitForBillingUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import {
	expectProductsUpdatedCorrect,
	waitForProductsUpdatedWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/expectProductsUpdatedWebhook";
import { expectPreviewBalanceChange } from "@tests/integration/billing/migrations-v2/update-plan-operation/previews/expectMigrationPreviewCorrect";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import {
	expectMigrationEventBillingPlanChangesEqual,
	expectMigrationItemEventCorrect,
	getMigrationItemEvents,
} from "../../utils/expectMigrationItemEvent";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const FROM_INCLUDED = 100;
const TO_INCLUDED = 200;
const CONSUMED = 60;

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

test(`${chalk.yellowBright("batch replace item events: event and webhooks share the canonical item diff")}`, async () => {
	const suffix = Date.now();
	const customerId = `batch-replace-events-${suffix}`;
	const plan = products.base({
		id: `batch-replace-events-plan-${suffix}`,
		items: [
			items.monthlyMessages({ includedUsage: FROM_INCLUDED }),
			items.dashboard(),
		],
	});
	const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [plan] }),
		],
		actions: [s.attach({ productId: plan.id })],
	});
	const beforeRow = await readScopedFeatureRow({
		ctx: scenarioCtx,
		customerId,
		featureId: TestFeature.Messages,
	});
	await scenarioCtx.db
		.update(customerEntitlements)
		.set({ balance: FROM_INCLUDED - CONSUMED })
		.where(eq(customerEntitlements.id, beforeRow.id));

	const { migration, migrationRunId, result } = await runChunkedMigration({
		ctx: scenarioCtx,
		migrationClient: autumnV2_3,
		migrationId: `batch-replace-events-migration-${suffix}`,
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [itemsV2.monthlyMessages({ included: TO_INCLUDED })],
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
	const [events, billingUpdated, productsUpdated] = await Promise.all([
		getMigrationItemEvents({ ...run, expectedCount: 1 }),
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
			features: [
				{
					featureId: TestFeature.Messages,
					balance: TO_INCLUDED - CONSUMED,
				},
			],
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
					{
						action: "deleted",
						featureId: TestFeature.Messages,
						included: FROM_INCLUDED,
					},
					{
						action: "created",
						featureId: TestFeature.Messages,
						included: TO_INCLUDED,
					},
				],
			},
		],
	});
	expectProductsUpdatedCorrect({
		data: productsUpdated,
		customerId,
		planId: plan.id,
		entityId: null,
		features: [
			{
				featureId: TestFeature.Messages,
				balance: TO_INCLUDED - CONSUMED,
			},
			{ featureId: TestFeature.Dashboard },
		],
	});

	if (!events) return;
	await expectMigrationItemEventCorrect({
		ctx: scenarioCtx,
		events,
		customerId,
		status: "succeeded",
		planChangeActions: ["updated"],
		planChangePlanIds: [plan.id],
		itemChanges: [
			{
				action: "deleted",
				featureId: TestFeature.Messages,
				included: FROM_INCLUDED,
			},
			{
				action: "created",
				featureId: TestFeature.Messages,
				included: TO_INCLUDED,
			},
		],
		balanceFeatureIds: [TestFeature.Messages],
	});
	const preview = await expectMigrationEventBillingPlanChangesEqual({
		ctx: scenarioCtx,
		events,
		customerId,
		billingUpdated,
	});
	expectPreviewBalanceChange({
		preview,
		featureId: TestFeature.Messages,
		balance: {
			granted: TO_INCLUDED,
			remaining: TO_INCLUDED - CONSUMED,
			usage: CONSUMED,
			unlimited: false,
		},
		previousAttributes: {
			granted: FROM_INCLUDED,
			remaining: FROM_INCLUDED - CONSUMED,
		},
	});
});
