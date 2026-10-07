import { afterAll, beforeAll, expect, test } from "bun:test";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { waitForUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
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
