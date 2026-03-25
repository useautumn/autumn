/**
 * Integration tests for customer.products.updated webhook via UPDATE SUBSCRIPTION endpoint.
 * Uses autumnV1.subscriptions.update() which calls handleUpdateSubscription.
 *
 * Verifies that webhooks are sent correctly for:
 * - Update with price change: scenario "upgrade" (new customer product created)
 * - Update with feature change only: scenario "upgrade"
 * - Trial removal: scenario "upgrade" (trial ends, new billing cycle starts)
 *
 * Uses Svix Play (https://www.svix.com/play/) to receive and verify webhooks.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiProduct } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVIX PLAY SETUP (shared across all tests)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE SUBSCRIPTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook update-sub: increase included usage - scenario: upgrade")}`, async () => {
	const customerId = "webhook-update-usage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	// Setup: customer with Pro ($20/month, 100 messages) attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Action: update subscription to increase included usage from 100 to 200 (same price)
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, priceItem],
	});

	// Assert: webhook received with scenario "upgrade"
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "upgrade" &&
			payload.data?.updated_product?.id === pro.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("upgrade");
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer.id).toBe(customerId);

	// Verify customer state: Pro is active with new features
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});
});
