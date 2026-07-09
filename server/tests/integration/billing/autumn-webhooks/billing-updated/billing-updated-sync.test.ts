/**
 * Integration test: `billing.updated` webhook fires when manually syncing
 * a Stripe subscription via `billing.sync_v2`.
 *
 * Scenario: A customer has a Stripe subscription that needs to be synced into
 * Autumn state (e.g., after correcting customer mapping, importing existing
 * subscriptions, or reconciling state). The sync operation should emit
 * `billing.updated` so downstream systems can update their local state.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
} from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse & { tags?: string[] };
};

const findChange = (
	plan_changes: CustomerPlanChange[] | undefined,
	{ action, planId }: { action: string; planId: string },
): CustomerPlanChange | undefined =>
	plan_changes?.find(
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

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC EMITS WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: manual sync emits webhook with 'reconciled' tag")}`, async () => {
	const customerId = "billing-updated-sync";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach creates the Stripe subscription
			s.attach({ productId: pro.id }),
		],
	});

	// Get the subscription ID that was created
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Manual sync operation (simulates admin reconciliation)
	await autumnV2_2.post("/v1/billing.sync_v2", {
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				stripe_subscription_id: subscriptionId,
			},
		],
	});

	// Wait for the billing.updated webhook
	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(payload.data?.tags ?? []).includes("reconciled"),
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	
	// Verify the webhook has the reconciled tag
	expect(data.tags).toContain("reconciled");
	
	// Verify there's an activated change for the synced plan
	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(activated).toBeDefined();
	expect(activated?.subscription?.plan_id).toBe(pro.id);
});
