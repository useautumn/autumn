/**
 * Filter-mode batch replace stamps each customer's live from-definition onto
 * item_changes and webhooks — not catalog ids[0].
 *
 * Contract:
 *   customerA 10/mo vs customerB 5/mo → minted 30
 *   each customer's deleted+created item_changes / billing.updated / events
 *   carry THAT customer's from allowance, to=30, remaining = 30 - consumed
 *
 * Red (catalog from-ent): B item_changes.included = 10, remaining delta uses 10
 * Green: 10 vs 5 from, remaining 27 vs 28
 */
import { afterAll, beforeAll, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { waitForBillingUpdatedWebhook } from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import { waitForProductsUpdatedWebhook } from "@tests/integration/billing/autumn-webhooks/utils/expectProductsUpdatedWebhook";
import { expectBatchLane } from "@tests/integration/billing/migrations-v2/batch-migrations/version-repoint/utils/versionRepointTestUtils";
import { expectFilterLiveDefinitionCorrect } from "@tests/integration/billing/migrations-v2/utils/expectFilterLiveDefinitionCorrect";
import { getMigrationItemEvents } from "@tests/integration/billing/migrations-v2/utils/expectMigrationItemEvent";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
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
import {
	expectReplacedFeatureRowCorrect,
	repointToCustomEntitlement,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";

const TO_INCLUDED = 30;

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
	`${chalk.yellowBright("batch replace item events: each customer's live from-definition is stamped on item_changes")}`,
	async () => {
		const suffix = Date.now();
		const customerA = `batch-replace-live-10-${suffix}`;
		const customerB = `batch-replace-live-5-${suffix}`;
		const cases = [
			{ customerId: customerA, fromIncluded: 10, consumed: 3 },
			{ customerId: customerB, fromIncluded: 5, consumed: 2 },
		].map((row) => ({
			...row,
			remaining: TO_INCLUDED - row.consumed,
			previousRemaining: row.fromIncluded - row.consumed,
		}));

		const plan = products.base({
			id: `batch-replace-live-plan-${suffix}`,
			items: [
				items.monthlyMessages({ includedUsage: 10 }),
				items.dashboard(),
			],
		});
		const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
			customerId: customerA,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.otherCustomers([{ id: customerB }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customerB,
						productId: plan.id,
					}),
				),
			],
		});

		await repointToCustomEntitlement({
			ctx: scenarioCtx,
			customerId: customerB,
			featureId: TestFeature.Messages,
			overrides: { allowance: 5 },
		});

		const beforeRows = new Map(
			await Promise.all(
				cases.map(async (row) => {
					const before = await setScopedFeatureBalance({
						ctx: scenarioCtx,
						customerId: row.customerId,
						featureId: TestFeature.Messages,
						balance: row.previousRemaining,
					});
					return [row.customerId, before] as const;
				}),
			),
		);

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_3,
			migrationId: `batch-replace-live-migration-${suffix}`,
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
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
							],
							add_items: [itemsV2.monthlyMessages({ included: TO_INCLUDED })],
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
			expectedCount: 2,
		});
		const delivered = await Promise.all(
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
						features: [
							{
								featureId: TestFeature.Messages,
								balance: row.remaining,
							},
						],
					}),
				]);
				return { ...row, billingUpdated, productsUpdated };
			}),
		);
		const events = await eventsPromise;

		for (const row of delivered) {
			const before = beforeRows.get(row.customerId);
			if (!before) {
				throw new Error(`missing before-row for ${row.customerId}`);
			}
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
					{
						action: "created",
						featureId: TestFeature.Messages,
						included: TO_INCLUDED,
					},
				],
				balance: {
					featureId: TestFeature.Messages,
					granted: TO_INCLUDED,
					remaining: row.remaining,
					usage: row.consumed,
					previousGranted: row.fromIncluded,
					previousRemaining: row.previousRemaining,
				},
			});
			await expectReplacedFeatureRowCorrect({
				ctx: scenarioCtx,
				customerId: row.customerId,
				featureId: TestFeature.Messages,
				beforeRowId: before.id,
				beforeEntitlementId: before.entitlement_id,
				balance: row.remaining,
			});
		}
	},
);
