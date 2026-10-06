/**
 * Usage alerts with `basis: "usage_limit"`: the cap's window-counter usage over
 * its limit drives the crossing check; the webhook carries a usage_limit block.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval, usageLimitFilterKey } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	countUsageAlertWebhooks,
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
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

// ── B9: unlimited feature + usage_limit alert → never fires ─────────────────
test(`${chalk.yellowBright("ul-alert8: unlimited feature never fires a usage_limit alert")}`, async () => {
	const customerId = "ul-alert-unlimited-1";
	const plan = products.base({
		id: "ul-alert-unlimited",
		items: [items.unlimitedMessages()],
	});
	await setupCustomer({ customerId, planId: plan.id, plan });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 160 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});

// ── B12: bulk track crosses 80 and 100 on the window path ───────────────────
test(`${chalk.yellowBright("ul-alert11: one track crossing 80% and 100% of the cap fires both")}`, async () => {
	const customerId = "ul-alert-bulk-1";
	await setupCustomer({ customerId, planId: "ul-alert-bulk" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 80 }),
			usageLimitAlert({ threshold: 100 }),
		],
	});

	await track({ customerId, value: 200 });
	const eighty = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	const hundred = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 100,
	});
	expect(eighty.usage_limit?.usage).toBe(200);
	expect(hundred.usage_limit?.remaining).toBe(0);
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

// ── B15: limit 0 → percentage skips, nothing throws ─────────────────────────
test(`${chalk.yellowBright("ul-alert13: a zero cap never fires and never divides by zero")}`, async () => {
	const customerId = "ul-alert-zero-1";
	await setupCustomer({ customerId, planId: "ul-alert-zero" });
	await setDailyLimit(customerId, 0);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 80 }),
			usageLimitAlert({ threshold: 0, thresholdType: "usage" }),
		],
	});

	await track({ customerId, value: 5 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 0,
		timeoutMs: 1000,
	});
});
