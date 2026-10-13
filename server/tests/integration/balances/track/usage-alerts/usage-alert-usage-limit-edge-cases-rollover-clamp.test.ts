import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	expectNoUsageAlert,
	waitForNextMinuteBucket,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expireUsageWindowForReset } from "../../utils/usage-limit-utils/expireUsageWindowForReset.js";
import {
	autumnV2_3,
	track,
	usageLimitAlert,
} from "./utils/usageAlertUsageLimitEdgeCases.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["balances.usage_alert_triggered", "balances.limit_reached"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

const setupCappedCustomer = async ({
	customerId,
	planId,
	limit = 200,
}: {
	customerId: string;
	planId: string;
	limit?: number;
}) => {
	const plan = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit,
		interval: ResetInterval.Day,
		anchor: "utc",
	});
};

test(`${chalk.yellowBright("ul-edge1: a rollover mid-track never fires a remaining alert from yesterday's usage")}`, async () => {
	const customerId = "ul-edge-rollover-remaining-1";
	await setupCappedCustomer({
		customerId,
		planId: "ul-edge-rollover-remaining",
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 5, thresholdType: "remaining" }),
		],
	});

	await track({ customerId, value: 190 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 5 });

	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	await waitForNextMinuteBucket();
	await track({ customerId, value: 1 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 5 });
});

test(`${chalk.yellowBright("ul-edge2: a usage_limit percentage above 100 can never fire because the cap clamps usage")}`, async () => {
	const customerId = "ul-edge-over-100-1";
	await setupCappedCustomer({ customerId, planId: "ul-edge-over-100" });
	await setCustomerUsageAlerts({
		autumn: autumnV2_3,
		customerId,
		usageAlerts: [
			usageLimitAlert({ threshold: 150 }),
			usageLimitAlert({ threshold: 100 }),
		],
	});

	await track({ customerId, value: 400 });
	const capped = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 100,
	});
	expect(capped.usage_limit?.usage).toBe(200);
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 150 });
});
