/**
 * Usage alerts with `basis: "usage_limit"`: the cap's window-counter usage over
 * its limit drives the crossing check; the webhook carries a usage_limit block.
 */

import { afterAll, beforeAll, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	waitForNextMinuteBucket,
	waitForUsageAlert,
	waitForUsageAlertCount,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { expireUsageWindowForReset } from "../../utils/usage-limit-utils/expireUsageWindowForReset.js";
import {
	autumnV2_3,
	setDailyLimit,
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

// ── B11: a rolled-over window re-arms remaining thresholds ──────────────────
test(`${chalk.yellowBright("ul-alert10: a rolled-over window measures a fresh cap so remaining re-arms")}`, async () => {
	const customerId = "ul-alert-rollover-1";
	await setupCustomer({ customerId, planId: "ul-alert-rollover" });
	await setDailyLimit(customerId);
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 150, thresholdType: "remaining" }),
		],
	});

	// 200 → 100 remaining crosses 150 on the way down.
	await track({ customerId, value: 100 });
	await waitForUsageAlert({ token: playToken, customerId, threshold: 150 });

	await timeout(4000);
	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		shiftMs: ms.days(1),
	});
	await waitForNextMinuteBucket();

	// A stale "before" of 100 remaining would already sit under 150 and suppress this.
	await track({ customerId, value: 60 });
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 150,
		count: 2,
	});
});
