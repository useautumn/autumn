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

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

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
