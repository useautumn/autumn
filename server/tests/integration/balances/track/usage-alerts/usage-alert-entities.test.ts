/**
 * Integration tests for entity-scoped usage alert webhooks.
 *
 * Verifies that `balances.usage_alert_triggered` webhooks fire correctly
 * when entity-level usage alerts are configured, including:
 * - Per-entity items (entityFeatureId scoping)
 * - Entity-level alerts on individual entities
 * - Multiple entities with different alert thresholds
 * - Customer-level alerts still fire alongside entity-level alerts
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

type BalancesUsageAlertTriggeredPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		entity_id?: string;
		usage_alert: {
			name?: string;
			threshold: number;
			threshold_type: string;
		};
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
		filterTypes: ["balances.usage_alert_triggered"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Per-entity item — entity-level usage alert triggers with entity_id
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("entity-alert1: per-entity item triggers entity-scoped alert with entity_id")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "ea-per-entity-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "entity-alert-per-entity-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	// Set entity-level usage alert
	await autumnV2_1.entities.update(customerId, entities[0].id, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 400,
					threshold_type: "usage",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 450 usage on entity — crosses threshold of 400
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 450,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id &&
			payload.data?.usage_alert?.threshold === 400,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.usage_alert_triggered");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.entity_id).toBe(entities[0].id);
	expect(data.usage_alert.threshold).toBe(400);
	expect(data.usage_alert.threshold_type).toBe("usage");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Two entities with different thresholds — only the crossed one fires
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("entity-alert2: two entities, only entity crossing threshold fires alert")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "ea-two-ents-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "entity-alert-two-ents-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	// Entity 1: alert at 300
	await autumnV2_1.entities.update(customerId, entities[0].id, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 300,
					threshold_type: "usage",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Entity 2: alert at 700
	await autumnV2_1.entities.update(customerId, entities[1].id, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 700,
					threshold_type: "usage",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 400 on entity 1 — crosses its 300 threshold
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 400,
	});

	const entity1Result =
		await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entities[0].id &&
				payload.data?.usage_alert?.threshold === 300,
			timeoutMs: 15000,
		});

	expect(entity1Result).not.toBeNull();
	expect(entity1Result!.payload.data.entity_id).toBe(entities[0].id);

	// Wait and verify entity 2's alert (700) has NOT fired
	await timeout(5000);

	let entity2Fired = false;
	const history = await getPlayHistory({ token: playToken });
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesUsageAlertTriggeredPayload>(event);
			if (
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entities[1].id &&
				payload.data?.usage_alert?.threshold === 700
			) {
				entity2Fired = true;
			}
		} catch {
			// Skip
		}
	}
	expect(entity2Fired).toBe(false);

	// Now track 800 on entity 2 — crosses its 700 threshold
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 800,
	});

	const entity2Result =
		await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entities[1].id &&
				payload.data?.usage_alert?.threshold === 700,
			timeoutMs: 15000,
		});

	expect(entity2Result).not.toBeNull();
	expect(entity2Result!.payload.data.entity_id).toBe(entities[1].id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Customer-level alert still fires alongside entity-level alert
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("entity-alert3: customer-level and entity-level alerts both fire")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "ea-both-levels-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "entity-alert-both-levels-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	// Set customer-level alert at 200
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 200,
					threshold_type: "usage",
					enabled: true,
				},
			],
		},
	});

	// Set entity-level alert at 300
	await autumnV2_1.entities.update(customerId, entities[0].id, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 300,
					threshold_type: "usage",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 350 on entity — crosses both 200 (customer) and 300 (entity)
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 350,
	});

	// Customer-level alert (no entity_id in payload)
	const customerResult =
		await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				!payload.data?.entity_id &&
				payload.data?.usage_alert?.threshold === 200,
			timeoutMs: 15000,
		});

	expect(customerResult).not.toBeNull();
	expect(customerResult!.payload.data.entity_id).toBeUndefined();
	expect(customerResult!.payload.data.usage_alert.threshold).toBe(200);

	// Entity-level alert (has entity_id in payload)
	const entityResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>(
		{
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entities[0].id &&
				payload.data?.usage_alert?.threshold === 300,
			timeoutMs: 15000,
		},
	);

	expect(entityResult).not.toBeNull();
	expect(entityResult!.payload.data.entity_id).toBe(entities[0].id);
	expect(entityResult!.payload.data.usage_alert.threshold).toBe(300);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Entity percentage threshold alert
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("entity-alert4: entity percentage threshold fires correctly")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 200,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "ea-pct-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "entity-alert-pct-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	// Set entity-level percentage alert at 80%
	await autumnV2_1.entities.update(customerId, entities[0].id, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 80,
					threshold_type: "usage_percentage",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 170 usage on entity — 85% of 200, crosses 80% threshold
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 170,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id &&
			payload.data?.usage_alert?.threshold === 80,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.entity_id).toBe(entities[0].id);
	expect(data.usage_alert.threshold).toBe(80);
	expect(data.usage_alert.threshold_type).toBe("usage_percentage");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Entity alert does not fire when below threshold
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("entity-alert5: entity alert does not fire when below threshold")}`, async () => {
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "ea-no-fire-1",
		items: [perEntityMessages],
	});

	const { customerId, autumnV2_1, entities } = await initScenario({
		customerId: "entity-alert-no-fire-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	// Set entity-level alert at 800
	await autumnV2_1.entities.update(customerId, entities[0].id, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 800,
					threshold_type: "usage",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track only 500 — below threshold
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entities[0].id &&
			payload.data?.usage_alert?.threshold === 800,
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});
