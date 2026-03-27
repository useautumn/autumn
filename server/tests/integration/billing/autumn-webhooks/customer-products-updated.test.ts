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
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
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
import { timeout } from "@/utils/genUtils";

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
// WEBHOOK TESTS - STRIPE-INITIATED CANCEL (default scheduled before webhook)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("webhook: Stripe-initiated cancel fires after default product scheduled")}`, async () => {
	const customerId = "webhook-stripe-cancel-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const freeDefault = products.base({
		id: "free-default",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1, ctx: testCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro, freeDefault] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Get Stripe subscription ID and cancel externally via Stripe CLI
	const subscriptionId = await getSubscriptionId({
		ctx: testCtx,
		customerId,
		productId: pro.id,
	});

	await testCtx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Wait for webhook triggered by the Stripe-initiated cancellation
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel",
		timeoutMs: 20000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("customer.products.updated");

	const { data } = result!.payload;

	expect(data.scenario).toBe("cancel");
	expect(data.updated_product).toBeDefined();
	expect(data.updated_product.id).toBe(pro.id);
	expect(data.customer).toBeDefined();
	expect(data.customer.id).toBe(customerId);

	// The webhook customer should include the scheduled default product
	// because webhooks now fire AFTER defaults are scheduled
	const scheduledProduct = data.customer.products.find(
		(p) => p.id === freeDefault.id,
	);
	expect(scheduledProduct).toBeDefined();
	expect(scheduledProduct!.status).toBe("scheduled");

	// Also verify via API that the state is correct
	await timeout(2000);
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: freeDefault.id,
	});
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
