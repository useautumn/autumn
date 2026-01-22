/**
 * Integration tests for customer.products.updated webhook.
 *
 * Verifies that webhooks are sent correctly when customers are created
 * with default products.
 *
 * Uses Svix Play (https://www.svix.com/play/) to receive and verify webhooks.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, ApiProduct } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	generatePlayToken,
	getPlayWebhookUrl,
	waitForWebhook,
} from "./utils/svixPlayClient.js";
import {
	createTestEndpoint,
	deleteTestEndpoint,
} from "./utils/svixTestEndpoint.js";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
		entity?: ApiEntityV0;
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVIX PLAY SETUP (shared across all tests)
// ═══════════════════════════════════════════════════════════════════════════════

let playToken: string;
let endpointId: string;

beforeAll(async () => {
	// 1. Generate Svix Play token
	playToken = await generatePlayToken();
	console.log(`Generated Svix Play token: ${playToken}`);

	// 2. Get org's Svix app ID
	const svixAppId = ctx.org.svix_config?.sandbox_app_id;
	if (!svixAppId) {
		throw new Error(
			"Test org does not have svix_config.sandbox_app_id configured. " +
				"Cannot run webhook integration tests without Svix app.",
		);
	}

	// 3. Create Svix endpoint pointing to Svix Play
	const playUrl = getPlayWebhookUrl(playToken);
	console.log(`Creating Svix endpoint: ${playUrl}`);
	endpointId = await createTestEndpoint({ appId: svixAppId, playUrl });
	console.log(`Created Svix endpoint: ${endpointId}`);
});

afterAll(async () => {
	// Cleanup: delete Svix endpoint
	const svixAppId = ctx.org.svix_config?.sandbox_app_id;
	if (svixAppId && endpointId) {
		await deleteTestEndpoint({ appId: svixAppId, endpointId });
		console.log(`Deleted Svix endpoint: ${endpointId}`);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook: customer.products.updated on create with default product")}`, async () => {
	const customerId = "webhook-create-default";

	// Setup: create a default product for this test
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free-default",
		items: [messagesItem],
		isDefault: true,
	});

	// Only setup products, don't create customer yet
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [freeDefault], prefix: customerId }),
		],
		actions: [],
	});

	// Create customer with default product and webhooks enabled
	await autumnV1.customers.create({
		id: customerId,
		name: "Webhook Test Customer",
		internalOptions: {
			disable_defaults: false,
			default_group: customerId, // Only attach products with this group/prefix
		},
		skipWebhooks: false,
	});

	// Wait for webhook to arrive at Svix Play
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId,
		timeoutMs: 15000,
	});

	// Verify webhook was received
	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	// Verify scenario
	expect(data.scenario).toBe("new");

	// Verify customer in webhook payload
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);
	expect(data.customer.name).toBe("Webhook Test Customer");

	// Verify updated_product in webhook payload
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(freeDefault.id);
	expect(data.updated_product.is_default).toBe(true);

	// No entity for customer-level product
	expect(data.entity).toBeUndefined();

	// Also verify the customer state via API
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: freeDefault.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});
