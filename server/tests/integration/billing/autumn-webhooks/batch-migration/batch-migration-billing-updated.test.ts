/**
 * Batch migration lane: `billing.updated` webhook payloads, end to end
 * through Svix Play.
 *
 * Contract under test:
 *   Envelope:
 *     - { object: "billing.updated", customer_id, entity_id (only when the
 *       changed customer product is entity-level), plan_changes, tags }
 *   Plan changes:
 *     - one `updated` change per customer product that gained items, carrying
 *       a real subscription snapshot (plan_id, status "active", past_due
 *       false) — never a floating change without plan identity;
 *     - one `created` item_change per added feature (multi-feature adds);
 *     - a customer holding SEVERAL migrated plans gets ONE webhook with one
 *       plan change per plan;
 *     - entity-level customer products deliver in their OWN webhook with
 *       entity_id set, separate from the customer-level webhook.
 *   Absence:
 *     - a customer skipped by the batch lane (is_custom product) receives no
 *       webhook.
 *
 * The server→trigger delivery path is covered by billing-updated-migration.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { runChunkedMigration } from "../../migrations-v2/utils/runChunkedMigration.js";
import {
	expectBillingUpdatedCorrect,
	waitForBillingUpdatedWebhook,
} from "../utils/expectBillingUpdatedWebhook.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["billing.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

const addItems = [
	itemsV2.dashboard(),
	{ feature_id: TestFeature.Workflows, included: 10 },
];

// ── Contract: envelope + snapshot + multi-feature item changes. ──
test.concurrent(
	`${chalk.yellowBright("batch migration billing.updated: multi-feature add delivers snapshot-bearing plan change per customer")}`,
	async () => {
		const firstId = "batch-mig-bu-multi-1";
		const secondId = "batch-mig-bu-multi-2";
		const plan = products.base({ id: "batch-mig-bu-multi-plan", items: [] });

		const { autumnV2_2, ctx: scenarioCtx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer({ skipWebhooks: true }),
				s.otherCustomers([{ id: secondId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: secondId, productId: plan.id }),
				),
			],
		});

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-bu-multi",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: addItems },
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expect(result?.lane).toBe("batch");

		for (const customerId of [firstId, secondId]) {
			expectBillingUpdatedCorrect({
				data: await waitForBillingUpdatedWebhook({ playToken, customerId }),
				customerId,
				entityId: null,
				planChanges: [
					{
						planId: plan.id,
						itemChanges: [
							{ action: "created", featureId: TestFeature.Dashboard },
							{
								action: "created",
								featureId: TestFeature.Workflows,
								included: 10,
							},
						],
					},
				],
			});
		}
	},
);

// ── Contract: several migrated plans → ONE webhook, one change per plan. ──
test.concurrent(
	`${chalk.yellowBright("batch migration billing.updated: customer on two migrated plans gets one webhook with two plan changes")}`,
	async () => {
		const customerId = "batch-mig-bu-two-plans";
		const planA = products.base({ id: "batch-mig-bu-plan-a", items: [] });
		const planB = products.base({
			id: "batch-mig-bu-plan-b",
			items: [],
			isAddOn: true,
		});

		const { autumnV2_2, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ skipWebhooks: true }),
				s.products({ list: [planA, planB] }),
			],
			actions: [
				s.billing.attach({ productId: planA.id }),
				s.billing.attach({ productId: planB.id }),
			],
		});

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-bu-two-plans-mig",
			filter: { customer: { plan: { plan_id: planA.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planA.id },
						customize: {
							add_items: [{ feature_id: TestFeature.Workflows, included: 10 }],
						},
					},
					{
						type: "update_plan",
						plan_filter: { plan_id: planB.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expect(result?.lane).toBe("batch");

		expectBillingUpdatedCorrect({
			data: await waitForBillingUpdatedWebhook({ playToken, customerId }),
			customerId,
			planChanges: [
				{
					planId: planA.id,
					itemChanges: [
						{ action: "created", featureId: TestFeature.Workflows },
					],
				},
				{
					planId: planB.id,
					itemChanges: [
						{ action: "created", featureId: TestFeature.Dashboard },
					],
				},
			],
		});
	},
);

// ── Contract: entity-level products deliver separately with entity_id. ──
test.concurrent(
	`${chalk.yellowBright("batch migration billing.updated: entity-level product delivers its own webhook carrying entity_id")}`,
	async () => {
		const customerId = "batch-mig-bu-entity";
		const plan = products.base({ id: "batch-mig-bu-entity-plan", items: [] });

		const {
			autumnV2_2,
			entities,
			ctx: scenarioCtx,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ skipWebhooks: true }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
			],
		});
		const entityId = entities[0].id;

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-bu-entity-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expect(result?.lane).toBe("batch");

		const [customerLevel, entityLevel] = await Promise.all([
			waitForBillingUpdatedWebhook({ playToken, customerId, entityId: null }),
			waitForBillingUpdatedWebhook({ playToken, customerId, entityId }),
		]);

		const expectedPlanChanges = [
			{
				planId: plan.id,
				itemChanges: [
					{ action: "created" as const, featureId: TestFeature.Dashboard },
				],
			},
		];
		expectBillingUpdatedCorrect({
			data: customerLevel,
			customerId,
			entityId: null,
			planChanges: expectedPlanChanges,
		});
		expectBillingUpdatedCorrect({
			data: entityLevel,
			customerId,
			entityId,
			planChanges: expectedPlanChanges,
		});
	},
);

// ── Contract: skipped (is_custom) customers receive no webhook. ──
test.concurrent(
	`${chalk.yellowBright("batch migration billing.updated: skipped custom customer receives no webhook")}`,
	async () => {
		const plainId = "batch-mig-bu-skip-plain";
		const customId = "batch-mig-bu-skip-custom";
		const plan = products.base({ id: "batch-mig-bu-skip-plan", items: [] });

		const { autumnV2_2, ctx: scenarioCtx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer({ skipWebhooks: true }),
				s.otherCustomers([{ id: customId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customId,
						productId: plan.id,
						items: [
							items.dashboard(),
							items.freeAllocatedWorkflows({ includedUsage: 25 }),
						],
					}),
				),
			],
		});

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-bu-skip-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: addItems },
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expect(result?.lane).toBe("batch");

		// Positive control first: the plain customer's migration webhook arrives...
		expectBillingUpdatedCorrect({
			data: await waitForBillingUpdatedWebhook({
				playToken,
				customerId: plainId,
			}),
			customerId: plainId,
		});

		// ...and the skipped customer never gets one (their attach's `activated`
		// webhook is expected — only a migration `updated` change would be wrong).
		expect(
			await waitForBillingUpdatedWebhook({
				playToken,
				customerId: customId,
				timeoutMs: 3_000,
			}),
		).toBeNull();
	},
);
