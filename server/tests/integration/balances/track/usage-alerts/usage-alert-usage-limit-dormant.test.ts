/**
 * Usage alerts with `basis: "usage_limit"`: the cap's window-counter usage over
 * its limit drives the crossing check; the webhook carries a usage_limit block.
 */

import { afterAll, beforeAll, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { expectNoUsageAlert } from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
	setDailyLimit,
	setUsageLimits,
	setupCustomer,
	track,
	usageLimitAlert,
} from "./utils/usageAlertUsageLimit.js";

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

// ── B5: limit removed after the alert exists → dormant ──────────────────────
test(`${chalk.yellowBright("ul-alert4: removing the cap leaves the alert dormant")}`, async () => {
	const customerId = "ul-alert-removed-1";
	await setupCustomer({ customerId, planId: "ul-alert-removed" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});
	await setUsageLimits({ customerId, usageLimits: [] });

	await track({ customerId, value: 160 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});

// ── B6: limit disabled → quiet, not silently rebased onto the allowance ─────
test(`${chalk.yellowBright("ul-alert5: disabling the cap silences the alert")}`, async () => {
	const customerId = "ul-alert-disabled-1";
	await setupCustomer({ customerId, planId: "ul-alert-disabled" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});
	await setUsageLimits({
		customerId,
		usageLimits: [
			{
				feature_id: TestFeature.Messages,
				enabled: false,
				limit: 200,
				interval: ResetInterval.Day,
				anchor: "utc",
			},
		],
	});

	// 8000 / 10000 would be 80% of the plan allowance; the alert must not rebase.
	await track({ customerId, value: 8000 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});
