/**
 * Usage alerts with `basis: "usage_limit"`: the cap's window-counter usage over
 * its limit drives the crossing check; the webhook carries a usage_limit block.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ms, ResetInterval } from "@autumn/shared";
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
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { expectUsageLimitWindowContains } from "../../utils/usage-limit-utils/expectUsageLimitWindowContains.js";
import {
	autumnV2_3,
	numericFilterValue,
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

// ── B1: basic usage_limit alert with full usage_limit block ─────────────────
test(`${chalk.yellowBright("ul-alert1: 80% of a 200/day cap fires with the usage_limit block")}`, async () => {
	const customerId = "ul-alert-basic-1";
	await setupCustomer({ customerId, planId: "ul-alert-basic" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	const trackedAt = Date.now();
	await track({ customerId, value: 160 });

	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_alert.basis).toBe("usage_limit");
	expect(data.usage_alert.filter).toBeUndefined();
	expect(data.balance).toBeUndefined();
	expect(data.usage_limit).toMatchObject({
		limit: 200,
		interval: "day",
		anchor: "utc",
		usage: 160,
		remaining: 40,
	});
	expectUsageLimitWindowContains({
		usageLimit: data.usage_limit,
		at: trackedAt,
		intervalMs: ms.days(1),
	});
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

// ── B4: plan-supplied limit + customer alert ────────────────────────────────
test(`${chalk.yellowBright("ul-alert3: customer alert resolves a plan-level cap")}`, async () => {
	const customerId = "ul-alert-plan-limit-1";
	const plan = products.base({
		id: "ul-alert-plan-limit",
		items: [items.monthlyMessages({ includedUsage: 10000 })],
		billingControls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 200,
					interval: ResetInterval.Day,
					anchor: "utc",
				},
			],
		},
	});
	await setupCustomer({ customerId, planId: plan.id, plan });
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 160 });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.usage_limit?.limit).toBe(200);
	expect(data.usage_limit?.usage).toBe(160);
});
