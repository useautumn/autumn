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
import {
	type BillingUpdatedPayload,
	findChange,
} from "./utils/billingUpdatedSubscriptionUpdated.js";

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
// SCHEDULE PHASE CHANGED
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: schedule phase change → tags includes phase_changed")}`, async () => {
	const customerId = "billing-updated-phase-change";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			// Schedule downgrade: pro takes over at premium's period end.
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			(payload.data?.tags ?? []).includes("phase_changed"),
		timeoutMs: 30000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.tags).toContain("phase_changed");

	// Old premium expires; pro (was scheduled) is now activated.
	const expired = findChange(data.plan_changes, {
		action: "expired",
		planId: premium.id,
	});
	const activated = findChange(data.plan_changes, {
		action: "activated",
		planId: pro.id,
	});
	expect(expired || activated).toBeDefined();
});
