import { afterAll, beforeAll, test } from "bun:test";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { expectNoUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
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
