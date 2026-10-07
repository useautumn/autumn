import { afterAll, beforeAll, expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { waitForUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { expectUsageLimitWindowContains } from "../../../utils/usage-limit-utils/expectUsageLimitWindowContains.js";
import {
	autumnV2_3,
	setDailyLimit,
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
