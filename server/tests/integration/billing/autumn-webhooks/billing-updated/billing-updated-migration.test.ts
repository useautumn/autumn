/**
 * Migration execution should emit billing.updated like normal billing actions.
 * Red: server-run migrations mutate Autumn but never send the webhook.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse;
};

const findChange = (
	planChanges: CustomerPlanChange[] | undefined,
	{ action, planId }: { action: PlanChangeAction; planId: string },
): CustomerPlanChange | undefined =>
	planChanges?.find(
		(change) =>
			change.action === action &&
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId,
	);

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

test(`${chalk.yellowBright("billing.updated: migration update_plan emits webhook")}`, async () => {
	const suffix = Date.now();
	const customerId = `billing-updated-migration-${suffix}`;
	const enterprise = products.base({
		id: `enterprise-migration-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx: scenarioCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [enterprise] }),
		],
		actions: [s.billing.attach({ productId: enterprise.id })],
	});

	let webhookResult:
		| Awaited<ReturnType<typeof waitForWebhook<BillingUpdatedPayload>>>
		| undefined;

	await runUpdatePlanMigration({
		ctx: scenarioCtx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: enterprise.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: enterprise.id },
					customize: {
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
		noBillingChanges: true,
		runOnServer: true,
		waitFor: async () => {
			webhookResult = await waitForWebhook<BillingUpdatedPayload>({
				token: playToken,
				predicate: (payload) =>
					payload.type === "billing.updated" &&
					payload.data?.customer_id === customerId &&
					findChange(payload.data.plan_changes, {
						action: "updated",
						planId: enterprise.id,
					}) !== undefined,
				timeoutMs: 5_000,
				logWebhook: false,
			});
			expect(webhookResult).not.toBeNull();
		},
		timeoutMs: 20_000,
		pollIntervalMs: 500,
	});

	expect(webhookResult).toBeDefined();
	const { data } = webhookResult!.payload;
	const updated = findChange(data.plan_changes, {
		action: "updated",
		planId: enterprise.id,
	});
	expect(updated).toBeDefined();
	expect(updated?.item_changes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				action: "created",
				feature_id: TestFeature.Dashboard,
			}),
		]),
	);
});
