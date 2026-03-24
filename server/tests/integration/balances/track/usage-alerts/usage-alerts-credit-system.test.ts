/**
 * Usage alert webhooks when tracking metered features that deduct a shared credit pool.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { LimitedItem } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";

type BalancesUsageAlertTriggeredPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		usage_alert: {
			threshold: number;
			threshold_type: string;
		};
	};
};

const creditsItem = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
}) as LimitedItem;

const creditSystemProduct = constructProduct({
	type: "pro",
	isDefault: false,
	items: [creditsItem],
	id: "ua-credit-system-pro",
});

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const applicationId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId: applicationId,
		filterTypes: ["balances.usage_alert_triggered"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("usage-alert credit system: track action1 triggers alert on credits feature")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-credit-action1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [creditSystemProduct] }),
		],
		actions: [s.attach({ productId: creditSystemProduct.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Credits,
				threshold: 30,
				threshold_type: "usage",
				enabled: true,
			},
		],
	});

	// action1 credit_cost 0.2 → 160 units => 32 credits usage (crosses 30)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 160,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.feature_id === TestFeature.Credits &&
			payload.data?.usage_alert?.threshold === 30,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.data.feature_id).toBe(TestFeature.Credits);
	expect(result?.payload.data.usage_alert.threshold_type).toBe("usage");
});

test(`${chalk.yellowBright("usage-alert credit system: track action2 triggers alert on credits feature")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-credit-action2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [creditSystemProduct] }),
		],
		actions: [s.attach({ productId: creditSystemProduct.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Credits,
				threshold: 30,
				threshold_type: "usage",
				enabled: true,
			},
		],
	});

	// action2 credit_cost 0.6 → 50 units => 30 credits usage (crosses threshold)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action2,
		value: 50,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.feature_id === TestFeature.Credits &&
			payload.data?.usage_alert?.threshold === 30,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.data.feature_id).toBe(TestFeature.Credits);
});
