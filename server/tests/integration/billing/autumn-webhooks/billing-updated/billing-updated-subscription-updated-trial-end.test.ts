/**
 * Integration tests for `billing.updated` webhooks emitted from Stripe's
 * `customer.subscription.updated` flow — `handleStripeSubscriptionUpdated`.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
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
import type { BillingUpdatedPayload } from "./utils/billingUpdatedSubscriptionUpdated.js";

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
// TRIAL ENDED
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: trial end → tags includes trial_ended")}`, async () => {
	const customerId = "billing-updated-trial-end";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro",
		items: [messagesItem],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 16 }), // past 14-day trial
		],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(payload.data?.tags ?? []).includes("trial_ended"),
		timeoutMs: 30000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.tags).toContain("trial_ended");
});
