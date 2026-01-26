/**
 * Integration tests for customer.products.updated webhook.
 *
 * Verifies that webhooks are sent correctly for:
 * - Customer creation with default products
 * - Cancel end of cycle (scenario: cancel)
 * - Uncancel (scenario: renew)
 * - Entity-level cancel and uncancel
 *
 * Uses Svix Play (https://www.svix.com/play/) to receive and verify webhooks.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, ApiProduct } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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
// WEBHOOK TESTS - CUSTOMER CREATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook: customer.products.updated on create with default product")}`, async () => {
	const customerId = "webhook-create-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free-default",
		items: [messagesItem],
		isDefault: true,
	});

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
			default_group: customerId,
		},
		skipWebhooks: false,
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	expect(data.scenario).toBe("new");
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);
	expect(data.customer.name).toBe("Webhook Test Customer");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(freeDefault.id);
	expect(data.updated_product.is_default).toBe(true);
	expect(data.entity).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: freeDefault.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TESTS - CANCEL
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook: cancel end of cycle (no default product) - scenario: cancel")}`, async () => {
	const customerId = "webhook-cancel-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Initialize customer, attach pro, then cancel at end of cycle
	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	expect(data.scenario).toBe("cancel");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("webhook: cancel end of cycle (with free default product) - scenario: cancel")}`, async () => {
	const customerId = "webhook-cancel-with-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const freeDefault = products.base({
		id: "free-default",
		items: [messagesItem],
		isDefault: true,
	});

	// Initialize customer, attach pro, then cancel at end of cycle
	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, freeDefault] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	// Scenario is "cancel" (not "downgrade") since scheduled product is FREE
	expect(data.scenario).toBe("cancel");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TESTS - UNCANCEL
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook: uncancel - scenario: renew")}`, async () => {
	const customerId = "webhook-uncancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Initialize customer, attach pro, cancel, then uncancel
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
			s.updateSubscription({ productId: pro.id, cancelAction: "uncancel" }),
		],
	});

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "renew",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	expect(data.scenario).toBe("renew");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	// Verify product is now active (not canceling)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TESTS - ENTITY-LEVEL CANCEL/UNCANCEL
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook: entity cancel end of cycle - scenario: cancel")}`, async () => {
	const customerId = "webhook-entity-cancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Initialize customer, attach pro to entity, then cancel at end of cycle
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.updateSubscription({
				productId: pro.id,
				entityIndex: 0,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const entityId = entities[0].id;

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel" &&
			payload.data?.entity?.id === entityId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	expect(data.scenario).toBe("cancel");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);

	// Verify entity is included in webhook
	expect(data.entity).toBeDefined();
	expect(data.entity?.id).toBe(entityId);

	// Verify entity product is canceling
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	await expectProductCanceling({ customer: entity, productId: pro.id });
});

test.concurrent(`${chalk.yellowBright("webhook: entity uncancel - scenario: renew")}`, async () => {
	const customerId = "webhook-entity-uncancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Initialize customer, attach pro to entity, cancel, then uncancel
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.updateSubscription({
				productId: pro.id,
				entityIndex: 0,
				cancelAction: "cancel_end_of_cycle",
			}),
			s.updateSubscription({
				productId: pro.id,
				entityIndex: 0,
				cancelAction: "uncancel",
			}),
		],
	});

	const entityId = entities[0].id;

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "renew" &&
			payload.data?.entity?.id === entityId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	expect(data.scenario).toBe("renew");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);

	// Verify entity is included in webhook
	expect(data.entity).toBeDefined();
	expect(data.entity?.id).toBe(entityId);

	// Verify entity product is now active (not canceling)
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	await expectProductActive({ customer: entity, productId: pro.id });
});
