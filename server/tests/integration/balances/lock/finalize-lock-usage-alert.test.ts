import { afterAll, beforeAll, test } from "bun:test";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { setCustomerUsageAlerts } from "@tests/integration/balances/utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	expectNoUsageAlert,
	waitForUsageAlert,
	waitForUsageAlertCount,
} from "@tests/integration/balances/utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * A lock takes usage the way a track does, and a finalize settles it: the alert fires on whichever
 * of the two crosses the threshold, and never on the one that does not.
 */

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

const setupAlertedCustomer = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const plan = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const { autumnV2_1, ctx: scenarioCtx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	await deleteLock({ ctx: scenarioCtx, lockId: customerId });
	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 800,
				threshold_type: "usage",
				enabled: true,
			},
		],
	});
	return { autumnV2_1 };
};

test(`${chalk.yellowBright("finalize-alert1: the lock stays under the threshold, the finalize settles above it and fires")}`, async () => {
	const customerId = "finalize-alert-1";
	const { autumnV2_1 } = await setupAlertedCustomer({
		customerId,
		planId: "finalize-alert-1",
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 500,
		lock: { enabled: true, lock_id: customerId },
	});
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 800 });

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 900,
	});
	await waitForUsageAlert({ token: playToken, customerId, threshold: 800 });
});

test(`${chalk.yellowBright("finalize-alert2: the lock crosses the threshold and fires; settling it at the same value fires nothing more")}`, async () => {
	const customerId = "finalize-alert-2";
	const { autumnV2_1 } = await setupAlertedCustomer({
		customerId,
		planId: "finalize-alert-2",
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 850,
		lock: { enabled: true, lock_id: customerId },
	});
	await waitForUsageAlert({ token: playToken, customerId, threshold: 800 });

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
	});
	// Long enough for a second delivery to have shown up; the count must still be one.
	await timeout(6000);
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 800,
		count: 1,
		timeoutMs: 1,
	});
});
