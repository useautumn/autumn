/**
 * Integration tests for Svix message tags on customer.products.updated webhooks.
 *
 * Tag format: "customer_id.<id>" and "entity_id.<id>".
 *
 * Contract under test:
 *   New types/fields:
 *     - sendSvixEvent({ ..., tags?: string[] }): tags optional, forwarded to MessageIn.tags.
 *   New behaviors:
 *     - sendProductsUpdated workflow, customer-level attach:
 *         outgoing svix message has tag "customer_id.<id>", no entity_id tag.
 *     - sendProductsUpdated workflow, entity-level attach:
 *         outgoing svix message has tags including BOTH
 *         "customer_id.<id>" AND "entity_id.<id>".
 *   Side effects:
 *     - MessageOut.tags contains the expected entries (verified by fetching
 *       the message by its svix-id header from the delivered webhook).
 *
 * Pre-impl red: messages exist but tags are null/absent on MessageOut.tags.
 * Post-impl green: MessageOut.tags contains the expected entries.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, ApiProduct } from "@autumn/shared";
import chalk from "chalk";
import { type MessageOut, Svix } from "svix";

/**
 * `svix.message.get` can return 404 briefly after delivery while the message
 * is still being indexed. Retry with a short backoff so we tolerate that
 * indexing lag without flaking.
 */
const getSvixMessageWithRetry = async (
	svix: Svix,
	appId: string,
	messageId: string,
	{ retries = 5, delayMs = 500 }: { retries?: number; delayMs?: number } = {},
): Promise<MessageOut> => {
	let lastError: unknown;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await svix.message.get(appId, messageId);
		} catch (error) {
			lastError = error;
			const code = (error as { code?: number })?.code;
			if (code !== 404) throw error;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	throw lastError;
};
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
// SVIX SETUP (shared across all tests)
// ═══════════════════════════════════════════════════════════════════════════════

let webhook: WebhookTestSetup;
let playToken: string;
let appId: string;
let svix: Svix;

beforeAll(async () => {
	appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["customer.products.updated"],
	});
	playToken = webhook.playToken;

	const apiKey = process.env.SVIX_API_KEY;
	if (!apiKey) throw new Error("SVIX_API_KEY required for tag tests");
	svix = new Svix(apiKey);
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER-LEVEL: customer_id tag only
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("svix tags: customer.products.updated (customer-level) has customer_id tag")}`,
	async () => {
		const customerId = "webhook-tags-customer-only";

		const pro = products.pro({
			id: "pro-tags-customer",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Confirm the webhook reached Svix (via Play delivery) and grab the svix-id
		// header so we can fetch the underlying message to inspect tags.
		const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "customer.products.updated" &&
				payload.data?.customer?.id === customerId,
			timeoutMs: 20000,
		});
		expect(result).not.toBeNull();

		const svixId = result!.event.headers["svix-id"];
		expect(svixId).toBeDefined();

		// ── Contract assertion 1: MessageOut.tags contains customer_id tag ───────
		const message = await getSvixMessageWithRetry(svix, appId, svixId);
		const customerTag = `customer_id.${customerId}`;
		expect(message.tags).toContain(customerTag);

		// ── Contract assertion 2: no entity_id tag for customer-level event ──────
		expect(
			message.tags?.some((t) => t.startsWith("entity_id.")),
		).toBe(false);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY-LEVEL: customer_id AND entity_id tags
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("svix tags: customer.products.updated (entity-level) has customer_id AND entity_id tags")}`,
	async () => {
		const customerId = "webhook-tags-entity";

		const pro = products.pro({
			id: "pro-tags-entity",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});
		const entityId = entities[0].id;

		// Confirm the webhook reached Svix and grab the svix-id header.
		const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "customer.products.updated" &&
				payload.data?.customer?.id === customerId &&
				payload.data?.entity?.id === entityId,
			timeoutMs: 20000,
		});
		expect(result).not.toBeNull();

		const svixId = result!.event.headers["svix-id"];
		expect(svixId).toBeDefined();

		// ── Contract assertion: tags include BOTH customer_id and entity_id ──────
		const message = await getSvixMessageWithRetry(svix, appId, svixId);
		const customerTag = `customer_id.${customerId}`;
		const entityTag = `entity_id.${entityId}`;
		expect(message.tags).toContain(customerTag);
		expect(message.tags).toContain(entityTag);
	},
);
