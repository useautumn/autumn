/**
 * Batch migration lane: webhook delivery controls.
 *
 * Contract under test:
 *   - `sendWebhooks: false` migrates identically but delivers NOTHING, even
 *     with a subscribed endpoint — the operator's off-switch;
 *   - `webhook_concurrency` above the max is rejected by /migrations.run
 *     (422), so a runaway value can never reach an org's endpoint.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
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
import { waitForBillingUpdatedWebhook } from "../utils/expectBillingUpdatedWebhook.js";

const addItems = [
	itemsV2.dashboard(),
	{ feature_id: TestFeature.Workflows, included: 10 },
];

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

// ── Contract: the off-switch migrates identically and delivers nothing. ──
test.concurrent(
	`${chalk.yellowBright("batch migration webhooks: sendWebhooks false migrates but delivers nothing")}`,
	async () => {
		const customerId = "batch-mig-controls-off";
		const plan = products.base({
			id: "batch-mig-controls-off-plan",
			items: [],
		});

		const { autumnV2_2, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [s.customer({ skipWebhooks: true }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
			migrationClient: autumnV2_2,
			migrationId: "batch-mig-controls-off-mig",
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
			controls: { webhooks: { sendWebhooks: false } },
		});
		expect(result?.lane).toBe("batch");

		// Migration applied normally...
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: plan.id,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Workflows,
			remaining: 10,
			usage: 0,
			planId: plan.id,
		});

		// ...but no migration webhook reached the subscribed endpoint (the
		// attach's own `activated` webhook is expected and unrelated).
		expect(
			await waitForBillingUpdatedWebhook({
				playToken,
				customerId,
				timeoutMs: 4_000,
			}),
		).toBeNull();
	},
);

// ── Contract: the run route clamps the blast radius at the boundary. ──
test.concurrent(
	`${chalk.yellowBright("batch migration webhooks: run route rejects out-of-range concurrency")}`,
	async () => {
		const customerId = "batch-mig-controls-validation";
		const plan = products.base({
			id: "batch-mig-controls-validation-plan",
			items: [],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ skipWebhooks: true }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_2.migrationsV2.deleteAndCreate({
			id: "batch-mig-controls-validation-mig",
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
			no_billing_changes: true,
		});

		await expect(
			autumnV2_2.post("/migrations.run", {
				id: "batch-mig-controls-validation-mig",
				dry_run: false,
				webhook_concurrency: 10_000,
			}),
		).rejects.toThrow();
	},
);
