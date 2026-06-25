/**
 * Plan ↔ customer override (same scope) + customer ↔ entity additive.
 *
 * checkUsageAlerts:
 *   1. customer-scope pass — resolveCustomerScopeAlerts returns the customer's
 *      own alerts if it has ANY for the feature, otherwise falls back to the
 *      plan's snapshotted alerts. So a customer alert SHADOWS every plan alert
 *      for that feature. Measured against the customer-scope AGGREGATE balance
 *      (pooled + every per-entity pool), no entity_id.
 *   2. entity-scope pass — the entity's own alerts, measured against the
 *      entity's combined balance, with entity_id. Runs additionally.
 *
 * Setup: pooled messages 100 + per-entity messages 50, one entity.
 *   - customer-scope aggregate granted = 150 (100 pooled + 50 entity)
 *   - entity-scope combined granted     = 150 (50 own + 100 shared)
 *   - plan alert:     remaining 60 (snapshot via attach billingControls)
 *   - customer alert: remaining 50
 *   - entity alert:   remaining 40
 *
 * Track 110 on the ENTITY (entity own 50 drained, 60 spills to pooled):
 *   - aggregate 150 → 40, entity combined 150 → 40.
 *   - entity (40) FIRES (entity pass)        — combined crosses 40.
 *   - customer (50) FIRES (customer pass)    — aggregate crosses 50 → additive.
 *   - plan (60) does NOT fire                — shadowed by the customer alert,
 *     never evaluated, even though 40 would have crossed 60.
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

const firedFor = async ({
	predicate,
}: {
	predicate: (payload: BalancesUsageAlertTriggeredPayload) => boolean;
}) => {
	const history = await getPlayHistory({ token: playToken });
	return history.data.some((event) => {
		try {
			return predicate(
				parseEventBody<BalancesUsageAlertTriggeredPayload>(event),
			);
		} catch {
			return false;
		}
	});
};

test(`${chalk.yellowBright("plan-cus-override: customer alert shadows plan alert; entity fires additively")}`, async () => {
	const pooledMessages = items.monthlyMessages({ includedUsage: 100 });
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "plan-cus-override-1",
		items: [pooledMessages, perEntityMessages],
	});

	const customerId = "usage-alert-plan-cus-override-1";
	const { autumnV2_1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: prod.id,
				billingControls: {
					usage_alerts: [
						{
							feature_id: TestFeature.Messages,
							threshold: 60,
							threshold_type: "remaining",
							enabled: true,
						},
					],
				},
			}),
		],
	});
	const entityId = entities[0].id;

	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 50,
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
					threshold: 40,
					threshold_type: "remaining",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 110 on the entity: entity own 50 drained, 60 spills to pooled.
	// aggregate 150 → 40, entity combined 150 → 40.
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 110,
	});

	// Entity alert (40) fires — entity pass, has entity_id.
	const entityFired = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.entity_id === entityId &&
			payload.data?.usage_alert?.threshold === 40,
		timeoutMs: 15000,
	});
	expect(entityFired).not.toBeNull();

	// Customer alert (50) fires — customer pass, no entity_id. Additive.
	const customerFired =
		await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				!payload.data?.entity_id &&
				payload.data?.usage_alert?.threshold === 50,
			timeoutMs: 15000,
		});
	expect(customerFired).not.toBeNull();

	// Plan alert (60) must NOT fire — shadowed by the customer alert.
	await timeout(4000);
	expect(
		await firedFor({
			predicate: (payload) =>
				payload.data?.customer_id === customerId &&
				payload.data?.usage_alert?.threshold === 60,
		}),
	).toBe(false);
});
