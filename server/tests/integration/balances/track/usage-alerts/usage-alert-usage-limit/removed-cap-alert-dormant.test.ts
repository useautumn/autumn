import { afterAll, beforeAll, test } from "bun:test";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { expectNoUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
	setDailyLimit,
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
