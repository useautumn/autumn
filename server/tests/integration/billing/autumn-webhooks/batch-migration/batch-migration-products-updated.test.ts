/**
 * Batch migration lane: `customer.products.updated` webhook payloads, end to
 * end through Svix Play.
 *
 * Contract under test:
 *   - one webhook per migrated customer product, scenario "new" (what the
 *     customize path emits for the same shape);
 *   - `updated_product` is the migrated plan;
 *   - `customer` embeds the full post-migration customer — the added features
 *     are already present with their granted balances;
 *   - entity-level customer products carry `entity` in the payload.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { runChunkedMigration } from "../../migrations-v2/utils/runChunkedMigration.js";
import {
	expectProductsUpdatedCorrect,
	waitForProductsUpdatedWebhook,
} from "../utils/expectProductsUpdatedWebhook.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["customer.products.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ── Contract: scenario "new" + migrated plan + post-migration customer. ──
test.concurrent(
	`${chalk.yellowBright("batch migration customer.products.updated: delivers scenario new with the post-migration customer")}`,
	async () => {
		const customerId = "batch-mig-pu-basic";
		const plan = products.base({ id: "batch-mig-pu-basic-plan", items: [] });

		const { autumnV2_2, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [s.customer({ skipWebhooks: true }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-pu-basic-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: {
							add_items: [
								itemsV2.dashboard(),
								{ feature_id: TestFeature.Workflows, included: 10 },
							],
						},
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expect(result?.lane).toBe("batch");

		expectProductsUpdatedCorrect({
			data: await waitForProductsUpdatedWebhook({
				playToken,
				customerId,
				scenario: "new",
			}),
			customerId,
			planId: plan.id,
			entityId: null,
			features: [
				{ featureId: TestFeature.Workflows, balance: 10 },
				{ featureId: TestFeature.Dashboard },
			],
		});
	},
);

// ── Contract: entity-level products carry `entity` in the payload. ──
test.concurrent(
	`${chalk.yellowBright("batch migration customer.products.updated: entity-level product carries the entity")}`,
	async () => {
		const customerId = "batch-mig-pu-entity";
		const plan = products.base({ id: "batch-mig-pu-entity-plan", items: [] });

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
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});
		const entityId = entities[0].id;

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-pu-entity-mig",
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

		expectProductsUpdatedCorrect({
			data: await waitForProductsUpdatedWebhook({
				playToken,
				customerId,
				entityId,
			}),
			customerId,
			planId: plan.id,
			scenario: "new",
			entityId,
		});
	},
);
