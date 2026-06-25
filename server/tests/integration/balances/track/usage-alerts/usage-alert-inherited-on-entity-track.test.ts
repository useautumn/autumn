/**
 * Customer / plan usage alert (with NO entity-level alert) still triggers when
 * usage is tracked on an entity — because the entity's usage counts toward the
 * customer-scope AGGREGATE balance.
 *
 * Subtlety under test: it fires as a customer-scope event (NO entity_id) against
 * the aggregate, NOT as an entity-scoped event. checkUsageAlerts never
 * re-evaluates a customer/plan alert against a single entity's balance with an
 * entity_id (step 2 uses only entity.usage_alerts).
 *
 * Setup: pooled messages 100 + per-entity messages 50, one entity.
 *   - customer-scope aggregate granted = 150, entity-scope combined = 150.
 *   - one alert: remaining_percentage 40 (fires at 40% left = remaining <= 60).
 *
 * Track 90 on the ENTITY -> aggregate 150 -> 60 (= 40% left), crosses 40%.
 *
 * Variant 3a: alert at the customer tier (customers.update).
 * Variant 3b: alert at the plan tier (attach billingControls snapshot).
 * Both: alert fires with NO entity_id; no entity-scoped event fires.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
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

const fortyPercentAlert = {
	feature_id: TestFeature.Messages,
	threshold: 40,
	threshold_type: "remaining_percentage" as const,
	enabled: true,
};

const buildProduct = (id: string) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyMessages({
				includedUsage: 50,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

test(`${chalk.yellowBright("inherited-3a: customer alert fires on an entity track (no entity_id, aggregate scope)")}`, async () => {
	const prod = buildProduct("inherited-entity-track-cus");
	const customerId = "usage-alert-inherited-cus-1";
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

	await autumnV2_1.customers.update(customerId, {
		billing_controls: { usage_alerts: [fortyPercentAlert] },
	});

	// Track 90 on the entity -> aggregate 150 -> 60 (40% left).
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 90,
	});

	const fired = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			!payload.data?.entity_id &&
			payload.data?.usage_alert?.threshold === 40 &&
			payload.data?.usage_alert?.threshold_type === "remaining_percentage",
		timeoutMs: 15000,
	});
	expect(fired).not.toBeNull();

	// No entity-scoped event (no entity alert exists).
	await timeout(4000);
	expect(
		await firedFor({
			predicate: (payload) =>
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entityId,
		}),
	).toBe(false);
});

test(`${chalk.yellowBright("inherited-3b: plan-default alert fires on an entity track (no entity_id, aggregate scope)")}`, async () => {
	const prod = buildProduct("inherited-entity-track-plan");
	const customerId = "usage-alert-inherited-plan-1";
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
				billingControls: { usage_alerts: [fortyPercentAlert] },
			}),
		],
	});
	const entityId = entities[0].id;

	// Track 90 on the entity -> aggregate 150 -> 60 (40% left).
	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 90,
	});

	const fired = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			!payload.data?.entity_id &&
			payload.data?.usage_alert?.threshold === 40 &&
			payload.data?.usage_alert?.threshold_type === "remaining_percentage",
		timeoutMs: 15000,
	});
	expect(fired).not.toBeNull();

	await timeout(4000);
	expect(
		await firedFor({
			predicate: (payload) =>
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entityId,
		}),
	).toBe(false);
});
