import { afterAll, beforeAll, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import { expectNoUsageAlert } from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setEntityUsageLimit } from "../../../utils/usage-limit-utils/entityUsageLimitUtils.js";
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

// ── B8b: an entity's own cap is not the customer alert's cap ────────────────
test(`${chalk.yellowBright("ul-alert14: a customer alert ignores an entity-owned cap on entity tracks")}`, async () => {
	const customerId = "ul-alert-entity-override-1";
	const entity = await setupCustomer({
		customerId,
		planId: "ul-alert-entity-override",
		withEntity: true,
	});
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});
	await setEntityUsageLimit({
		autumn: autumnV2_3,
		customerId,
		entityId: entity!.id,
		featureId: TestFeature.Messages,
		limit: 100,
		interval: ResetInterval.Day,
	});

	await track({ customerId, value: 90, entityId: entity!.id });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
});
