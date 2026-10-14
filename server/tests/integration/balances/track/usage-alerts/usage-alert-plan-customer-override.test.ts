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

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 110,
	});

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

	await timeout(4000);
	expect(
		await firedFor({
			predicate: (payload) =>
				payload.data?.customer_id === customerId &&
				payload.data?.usage_alert?.threshold === 60,
		}),
	).toBe(false);
});
