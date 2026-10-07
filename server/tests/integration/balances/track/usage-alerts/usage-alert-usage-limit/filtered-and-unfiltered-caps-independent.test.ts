import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval, usageLimitFilterKey } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	countUsageAlertWebhooks,
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
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

// ── B13: filtered and unfiltered caps alert independently ───────────────────
test(`${chalk.yellowBright("ul-alert12: filtered and unfiltered caps alert independently")}`, async () => {
	const customerId = "ul-alert-two-caps-1";
	await setupCustomer({ customerId, planId: "ul-alert-two-caps" });
	await setUsageLimits({
		customerId,
		usageLimits: [
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				limit: 200,
				interval: ResetInterval.Day,
				anchor: "utc",
			},
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				limit: 50,
				interval: ResetInterval.Day,
				anchor: "utc",
				filter: { properties: { apiKeyId: "key-a" } },
			},
		],
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 80 }),
			usageLimitAlert({
				threshold: 80,
				filter: { properties: { apiKeyId: "key-a" } },
			}),
		],
	});

	// 40 / 50 = 80% of the filtered cap, 20% of the unfiltered one.
	await track({ customerId, value: 40, properties: { apiKeyId: "key-a" } });
	const filtered = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: usageLimitFilterKey({ properties: { apiKeyId: "key-a" } }),
	});
	expect(filtered.usage_limit?.limit).toBe(50);
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "",
	});

	// 160 / 200 = 80% of the unfiltered cap; the filtered counter is untouched.
	await track({ customerId, value: 120, properties: { apiKeyId: "key-b" } });
	const unfiltered = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "",
	});
	expect(unfiltered.usage_limit?.limit).toBe(200);
	expect(unfiltered.usage_limit?.usage).toBe(160);
	expect(
		await countUsageAlertWebhooks({
			token: playToken,
			customerId,
			threshold: 80,
			filterKey: usageLimitFilterKey({ properties: { apiKeyId: "key-a" } }),
		}),
	).toBe(1);
});
