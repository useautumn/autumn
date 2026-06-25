/**
 * Plan-default usage alert at customer scope when the customer has no own alert.
 *
 * checkUsageAlerts runs two passes:
 *   1. customer scope — resolveCustomerScopeAlerts returns the customer's own
 *      alerts, or FALLS BACK to the plan's snapshotted alerts when the customer
 *      has none for the feature. Measured against the pooled balance, no entity_id.
 *   2. entity scope — only runs when the track is entity-scoped (`if (entityId)`).
 *
 * Setup: pooled messages 100 + per-entity messages 50, one entity.
 *   - plan default alert: remaining 10 (seeded via customize.billing_controls on
 *     attach → snapshotted onto the customer_product = the plan-default the
 *     runtime resolver reads).
 *   - customer: no alert.
 *   - entity alert: remaining 20.
 *
 * The customer-scope alert measures the AGGREGATE balance (pooled + every
 * entity pool): granted 150 here. So to cross a remaining=10 alert we must drop
 * the aggregate to 10, i.e. track 140 (not 90 — 90 leaves the aggregate at 60).
 *
 * Track 140 at the CUSTOMER level (aggregate 150 → 10):
 *   - plan default (10) FIRES at customer scope (no entity_id) — customer is
 *     silent so the plan fallback is the active customer-scope alert.
 *   - entity alert (20) does NOT fire — the entity pass is skipped for a
 *     customer-level track (`if (entityId)`), regardless of balance.
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

test(`${chalk.yellowBright("plan-default-cus-track: customer-level track uses the plan-default alert; entity alert is skipped")}`, async () => {
	const pooledMessages = items.monthlyMessages({ includedUsage: 100 });
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "plan-default-cus-track-1",
		items: [pooledMessages, perEntityMessages],
	});

	const customerId = "usage-alert-plan-default-cus-track-1";
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
							threshold: 10,
							threshold_type: "remaining",
							enabled: true,
						},
					],
				},
			}),
		],
	});
	const entityId = entities[0].id;

	await autumnV2_1.entities.update(customerId, entityId, {
		billing_controls: {
			usage_alerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 20,
					threshold_type: "remaining",
					enabled: true,
				},
			],
		} as EntityBillingControls,
	});

	// Track 140 at the CUSTOMER level (no entity_id): aggregate 150 → 10.
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 140,
	});

	// Plan-default alert (10) fires at customer scope — no entity_id.
	const planDefaultFired =
		await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				!payload.data?.entity_id &&
				payload.data?.usage_alert?.threshold === 10 &&
				payload.data?.usage_alert?.threshold_type === "remaining",
			timeoutMs: 15000,
		});
	expect(planDefaultFired).not.toBeNull();

	// Entity alert (20) must NOT fire — the entity pass is skipped on a
	// customer-level track.
	await timeout(4000);
	expect(
		await firedFor({
			predicate: (payload) =>
				payload.data?.customer_id === customerId &&
				payload.data?.entity_id === entityId &&
				payload.data?.usage_alert?.threshold === 20,
		}),
	).toBe(false);
});
