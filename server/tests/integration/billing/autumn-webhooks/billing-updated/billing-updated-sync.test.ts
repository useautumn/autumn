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
	SyncParamsV1,
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

test(`${chalk.yellowBright("billing.updated: manual sync emits webhook with 'resync' tag")}`, async () => {
	const customerId = "billing-updated-sync";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
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

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// expire_previous so re-sync produces real plan_changes (activated + expired)
	await autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: subscriptionId,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: pro.id, expire_previous: true }],
			},
		],
	} satisfies SyncParamsV1);

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(payload.data?.tags ?? []).includes("resync"),
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;

	expect(data.tags).toContain("resync");

	const updated = findChange(data.plan_changes, {
		action: "updated",
		planId: pro.id,
	});
	expect(updated).toBeDefined();
	expect(updated?.subscription?.plan_id).toBe(pro.id);
});
