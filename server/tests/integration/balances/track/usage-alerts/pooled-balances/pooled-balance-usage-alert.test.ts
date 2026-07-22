// Contract: usage-percentage alerts use the aggregate pooled grant after replacement.
// Tracking on an entity fires the customer-scoped alert exactly at 50% usage.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	buildPooledBalanceTestProducts,
	pooledBalanceTestValues,
} from "@tests/integration/balances/utils/pooledBalanceTestProducts.js";
import { setCustomerUsageAlerts } from "@tests/integration/balances/utils/usage-alert-utils/customerUsageAlertUtils.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type UsageAlertPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		entity_id?: string;
		usage_alert: { threshold: number; threshold_type: string };
	};
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["balances.usage_alert_triggered"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("pooled usage alert: free-to-Pro aggregate fires at exactly 50% usage")}`, async () => {
	const { freeEntityPlan, proEntityPlan } = buildPooledBalanceTestProducts({
		idPrefix: "pooled-usage-alert",
	});
	const { autumnV2_1, autumnV2_2, customerId, entities } = await initScenario({
		customerId: "pooled-usage-alert",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [freeEntityPlan, proEntityPlan] }),
		],
		actions: [
			s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 0 }),
			s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 1 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 40,
				entityIndex: 1,
				timeout: 2_000,
			}),
		],
	});
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: proEntityPlan.id,
		plan_schedule: "immediate",
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 50,
				threshold_type: "usage_percentage",
				enabled: true,
			},
		],
	});
	await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 35,
	});
	const event = await waitForWebhook<UsageAlertPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.feature_id === TestFeature.Messages &&
			payload.data?.entity_id === undefined &&
			payload.data?.usage_alert?.threshold === 50 &&
			payload.data?.usage_alert?.threshold_type === "usage_percentage",
		timeoutMs: 15_000,
	});
	expect(event).not.toBeNull();

	await timeout(2_000);
	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		granted:
			pooledBalanceTestValues.freeContribution +
			pooledBalanceTestValues.proContribution,
		remaining: 75,
		usage: 75,
		breakdownCount: 2,
	});
});
