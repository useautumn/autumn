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

// ── B8: customer limit inherited by an entity → aggregate counter ───────────
test(`${chalk.yellowBright("ul-alert7: customer cap inherited by an entity alerts at customer scope on entity tracks")}`, async () => {
	const customerId = "ul-alert-entity-inherit-1";
	const entity = await setupCustomer({
		customerId,
		planId: "ul-alert-entity-inherit",
		withEntity: true,
	});
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 100, entityId: entity!.id });
	await track({ customerId, value: 60, entityId: entity!.id });
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
	});
	expect(data.entity_id).toBeUndefined();
	expect(data.usage_limit?.usage).toBe(160);
});
