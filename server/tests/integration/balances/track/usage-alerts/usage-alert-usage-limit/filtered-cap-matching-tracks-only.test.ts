import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
	numericFilterValue,
	setUsageLimits,
	setupCustomer,
	setupUsageAlertWebhook,
	track,
	usageLimitAlert,
} from "./usageAlertUsageLimitUtils.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	webhook = await setupUsageAlertWebhook();
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ── B2 + B3: filtered cap, filter echoed, non-matching tracks ignored,
// numeric vs string filter values canonicalise ──────────────────────────────
test(`${chalk.yellowBright("ul-alert2: filtered cap alert reacts only to matching tracks and canonicalises filter values")}`, async () => {
	const customerId = "ul-alert-filter-1";
	await setupCustomer({ customerId, planId: "ul-alert-filter" });
	await setUsageLimits({
		customerId,
		usageLimits: [
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				limit: 200,
				interval: ResetInterval.Day,
				anchor: "utc",
				filter: { properties: { apiKeyId: numericFilterValue(123) } },
			},
		],
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({
				threshold: 80,
				filter: { properties: { apiKeyId: "123" } },
			}),
		],
	});

	await track({ customerId, value: 160, properties: { apiKeyId: "other" } });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });

	await track({ customerId, value: 160, properties: { apiKeyId: 123 } });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_alert.filter).toEqual({ properties: { apiKeyId: "123" } });
	expect(data.usage_limit?.usage).toBe(160);
	expect(data.usage_limit?.remaining).toBe(40);
});
