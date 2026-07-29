/**
 * Org scope vs plan / customer / entity.
 *
 * Org alerts are a fourth, fully-independent pass in checkUsageAlerts:
 *   - Purely additive — never overrides another tier, never shadowed.
 *   - Follows the tracked subject: passes entityId through, so on an entity
 *     track it measures the entity's combined balance and fires WITH entity_id.
 *     (The customer/plan pass is always aggregate / no entity_id.)
 *   - Env-scoped: sandbox reads config.sandbox_usage_alerts.
 *
 * Setup: pooled messages 100 + per-entity messages 50, one entity.
 *   - aggregate = 150, entity combined = 150.
 *   - customer alert remaining 70, entity alert remaining 60, org alert remaining 50.
 *
 * Track 100 on the ENTITY -> aggregate 150 -> 50, entity combined 150 -> 50.
 * All three fire:
 *   - customer (70): customer pass, NO entity_id.
 *   - entity   (60): entity pass, WITH entity_id.
 *   - org      (50): org pass, WITH entity_id (follows the tracked entity).
 */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { type DbUsageAlert, type EntityBillingControls } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { db } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

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

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: defaultCtx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["balances.usage_alert_triggered"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
	await setOrgUsageAlerts([]);
});

afterEach(async () => {
	await setOrgUsageAlerts([]);
});

async function setOrgUsageAlerts(usageAlerts: DbUsageAlert[]) {
	await OrgService.update({
		db,
		orgId: defaultCtx.org.id,
		updates: {
			config: {
				...defaultCtx.org.config,
				sandbox_usage_alerts: usageAlerts,
			},
		},
	});
}

test(`${chalk.yellowBright("org-vs-scopes: org fires additively alongside customer + entity, following the tracked entity")}`, async () => {
	const prod = products.base({
		id: "org-vs-scopes-1",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyMessages({
				includedUsage: 50,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const customerId = "usage-alert-org-vs-scopes-1";
	const { autumnV2_1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});
	const entityId = entities[0].id;

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 50,
			threshold_type: "remaining",
			enabled: true,
		} as DbUsageAlert,
	]);

	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 70,
					threshold_type: "remaining",
					enabled: true,
				},
			],
		},
	});
	await autumnV2_1.entities.update(customerId, entityId, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 60,
					threshold_type: "remaining",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 100 on the entity -> aggregate 150 -> 50, entity combined 150 -> 50.
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	// Customer (70): customer pass, no entity_id.
	const customerFired =
		await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				!payload.data?.entity_id &&
				payload.data?.usage_alert?.threshold === 70,
			timeoutMs: 15000,
		});
	expect(customerFired).not.toBeNull();

	// Entity (60): entity pass, with entity_id.
	const entityFired = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entityId &&
			payload.data?.usage_alert?.threshold === 60,
		timeoutMs: 15000,
	});
	expect(entityFired).not.toBeNull();

	// Org (50): org pass, follows the tracked entity -> with entity_id.
	const orgFired = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entityId &&
			payload.data?.usage_alert?.threshold === 50,
		timeoutMs: 15000,
	});
	expect(orgFired).not.toBeNull();
});
