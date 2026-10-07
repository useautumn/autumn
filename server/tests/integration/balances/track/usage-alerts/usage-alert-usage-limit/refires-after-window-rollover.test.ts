import { afterAll, beforeAll, test } from "bun:test";
import { ms } from "@autumn/shared";
import type { WebhookTestSetup } from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	waitForNextMinuteBucket,
	waitForUsageAlert,
	waitForUsageAlertCount,
} from "../../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { expireUsageWindowForReset } from "../../../utils/usage-limit-utils/expireUsageWindowForReset.js";
import {
	autumnV2_3,
	setDailyLimit,
	setupCustomer,
	setupUsageAlertWebhook,
	track,
	usageLimitAlert,
	waitForUsageWindowSynced,
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

// ── B10: re-fires in the next window ────────────────────────────────────────
test(`${chalk.yellowBright("ul-alert9: the alert fires again after the window rolls over")}`, async () => {
	const customerId = "ul-alert-refire-1";
	await setupCustomer({ customerId, planId: "ul-alert-refire" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [usageLimitAlert({ threshold: 80 })],
	});

	await track({ customerId, value: 160 });
	await waitForUsageAlert({ token: playToken, customerId, threshold: 80 });

	await waitForUsageWindowSynced({ customerId, usage: 160 });
	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		shiftMs: ms.days(1),
	});
	await waitForNextMinuteBucket();

	await track({ customerId, value: 160 });
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 80,
		count: 2,
	});
});
