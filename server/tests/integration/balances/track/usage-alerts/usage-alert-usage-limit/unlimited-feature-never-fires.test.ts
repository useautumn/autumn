import { afterAll, beforeAll, test } from "bun:test";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
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
