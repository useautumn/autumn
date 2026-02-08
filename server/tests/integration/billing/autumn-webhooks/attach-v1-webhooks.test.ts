/**
 * Integration tests for customer.products.updated webhook via ATTACH V1 endpoint.
 *
 * Verifies that webhooks are sent correctly for:
 * - Upgrade (Pro -> Premium): scenario "upgrade"
 * - Downgrade to paid (Premium -> Pro): scenario "downgrade"
 * - Cancel to free (Premium -> Free): scenario "cancel"
 * - Uncancel via re-attach (Pro -> Free -> Pro): scenario "renew"
 * - Entity-level upgrade/downgrade
 *
 * Uses Svix Play (https://www.svix.com/play/) to receive and verify webhooks.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, ApiProduct } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
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
// CUSTOMER-LEVEL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook v1: upgrade Pro -> Premium - scenario: upgrade")}`, async () => {
	const customerId = "webhook-v1-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	// Pro = $20/month, Premium = $50/month
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	// Setup: customer with Pro attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Action: attach Premium (upgrade from Pro)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	// Assert: webhook received with scenario "upgrade"
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "upgrade" &&
			payload.data?.updated_product?.id === premium.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("upgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	// Verify customer state: Premium is active
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: premium.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: downgrade Premium -> Pro - scenario: downgrade")}`, async () => {
	const customerId = "webhook-v1-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	// Pro = $20/month, Premium = $50/month
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	// Setup: customer with Premium attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Action: attach Pro (downgrade from Premium)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Assert: webhook received with scenario "downgrade" for Premium (being scheduled to cancel)
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "downgrade" &&
			payload.data?.updated_product?.id === premium.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("downgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	// Verify customer state: Premium is canceling, Pro is scheduled
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: cancel to free Premium -> Free - scenario: cancel")}`, async () => {
	const customerId = "webhook-v1-cancel-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	// Premium = $50/month, Free = $0
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	// Setup: customer with Premium attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [free, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Action: attach Free (cancel to free from Premium)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	// Assert: webhook received with scenario "cancel" for Premium (scheduled to free)
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel" &&
			payload.data?.updated_product?.id === premium.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("cancel");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	// Verify customer state: Premium is canceling, Free is scheduled
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: free.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: uncancel via attach Pro -> (cancel) -> Pro - scenario: renew")}`, async () => {
	const customerId = "webhook-v1-uncancel-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Setup: customer with Pro attached, then cancel to Free
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Verify Pro is canceling before re-attach
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: pro.id });

	// Action: re-attach Pro (uncancel via attach)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Assert: webhook received with scenario "renew" for Pro
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "renew" &&
			payload.data?.updated_product?.id === pro.id,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("renew");
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeUndefined();

	// Verify customer state: Pro is now active (not canceling)
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY-LEVEL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook v1: entity upgrade Pro -> Premium - scenario: upgrade")}`, async () => {
	const customerId = "webhook-v1-entity-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	// Setup: customer with entity, Pro attached to entity
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Action: attach Premium to entity (upgrade)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entityId,
	});

	// Assert: webhook received with scenario "upgrade" AND entity included
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "upgrade" &&
			payload.data?.updated_product?.id === premium.id &&
			payload.data?.entity?.id === entityId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("upgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeDefined();
	expect(data.entity?.id).toBe(entityId);

	// Verify entity state: Premium is active
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	await expectProductActive({ customer: entity, productId: premium.id });
});

test.concurrent(`${chalk.yellowBright("webhook v1: entity downgrade Premium -> Pro - scenario: downgrade")}`, async () => {
	const customerId = "webhook-v1-entity-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	// Setup: customer with entity, Premium attached to entity
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: premium.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Action: attach Pro to entity (downgrade)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});

	// Assert: webhook received with scenario "downgrade" AND entity included
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "downgrade" &&
			payload.data?.updated_product?.id === premium.id &&
			payload.data?.entity?.id === entityId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;
	expect(data.scenario).toBe("downgrade");
	expect(data.updated_product.id).toBe(premium.id);
	expect(data.customer.id).toBe(customerId);
	expect(data.entity).toBeDefined();
	expect(data.entity?.id).toBe(entityId);

	// Verify entity state: Premium is canceling, Pro is scheduled
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	await expectProductCanceling({ customer: entity, productId: premium.id });
	await expectProductScheduled({ customer: entity, productId: pro.id });
});
