import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { waitForUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
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
