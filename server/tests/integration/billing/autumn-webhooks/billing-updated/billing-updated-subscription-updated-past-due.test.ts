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
// PAST DUE
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("billing.updated: customer enters past_due → updated with past_due flip")}`, async () => {
	const customerId = "billing-updated-past-due";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data?.plan_changes, {
				action: "updated",
				planId: pro.id,
			})?.subscription?.past_due === true,
		timeoutMs: 30000,
	});

	expect(result).not.toBeNull();
	const updated = findChange(result!.payload.data.plan_changes, {
		action: "updated",
		planId: pro.id,
	});
	expect(updated?.subscription?.past_due).toBe(true);
	expect(updated?.previous_attributes).toMatchObject({ past_due: false });
});
