/**
 * Integration tests for the `balances.limit_reached` webhook at the entity level.
 *
 * `checkLimitReached` fires exactly once: entity-level when `entityId` is
 * provided, customer-level otherwise. These tests verify that entity-scoped
 * tracking only produces an entity-scoped webhook (no extra customer-level fire).
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { EntityBillingControls } from "@autumn/shared";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BalancesLimitReachedPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		limit_type: string;
		entity_id?: string;
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVIX PLAY SETUP
// ═══════════════════════════════════════════════════════════════════════════════

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["balances.limit_reached"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: entity included — per-entity allowance exhausted
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("limit-reached-ent1: per-entity included allowance exhausted fires webhook")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "lr-ent-included-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "lr-ent-included-cus-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id &&
			payload.data?.limit_type === "included",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.entity_id).toBe(entities[0].id);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.limit_type).toBe("included");

	// Single-fire: no customer-level webhook (without entity_id) should exist
	await timeout(3000);
	let customerLevelFired = false;
	const history = await getPlayHistory({ token: playToken });
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesLimitReachedPayload>(event);
			if (
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === customerId &&
				!payload.data?.entity_id
			) {
				customerLevelFired = true;
			}
		} catch {
			// Skip
		}
	}
	expect(customerLevelFired).toBe(false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: entity max_purchase — per-entity consumable cap reached
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("limit-reached-ent2: per-entity max_purchase cap reached fires webhook")}`, async () => {
	const consumableMsg = items.consumableMessages({
		includedUsage: 50,
		maxPurchase: 50,
		entityFeatureId: TestFeature.Users,
	});
	const proProd = products.pro({
		id: "lr-ent-maxpurchase-1",
		items: [consumableMsg],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "lr-ent-maxpurchase-cus-1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id &&
			payload.data?.limit_type === "max_purchase",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.entity_id).toBe(entities[0].id);
	expect(data.limit_type).toBe("max_purchase");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: entity spend_limit — per-entity spend limit reached
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("limit-reached-ent3: per-entity spend_limit reached fires webhook")}`, async () => {
	const consumableMsg = items.consumableMessages({
		includedUsage: 50,
		price: 1,
		entityFeatureId: TestFeature.Users,
	});
	const proProd = products.pro({
		id: "lr-ent-spendlimit-1",
		items: [consumableMsg],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "lr-ent-spendlimit-cus-1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	await autumnV2_1.entities.update(customerId, entities[0].id, {
		billing_controls: {
			spend_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					overage_limit: 10,
				},
			],
		} as EntityBillingControls,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 60,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id &&
			payload.data?.limit_type === "spend_limit",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.entity_id).toBe(entities[0].id);
	expect(data.limit_type).toBe("spend_limit");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: two entities — only the entity that hits limit fires webhook
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("limit-reached-ent4: two entities, only entity hitting limit fires webhook")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "lr-ent-twoents-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "lr-ent-twoents-cus-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const entity1Result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id,
		timeoutMs: 15000,
	});

	expect(entity1Result).not.toBeNull();
	expect(entity1Result!.payload.data.entity_id).toBe(entities[0].id);

	await timeout(5000);

	let entity2Fired = false;
	let customerLevelFired = false;
	const history = await getPlayHistory({ token: playToken });
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesLimitReachedPayload>(event);
			if (
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === customerId
			) {
				if (payload.data?.entity_id === entities[1].id) entity2Fired = true;
				if (!payload.data?.entity_id) customerLevelFired = true;
			}
		} catch {
			// Skip
		}
	}
	expect(entity2Fired).toBe(false);
	expect(customerLevelFired).toBe(false);
});
