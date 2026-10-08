// Mirrors the free-tier setup: the plan carries a 200/day cap and plan-level usage_limit
// alerts at 80, 100 and 200 that every customer on the plan inherits.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { waitForLimitReached } from "../../utils/limit-reached-utils/limitReachedWebhookUtils.js";
import {
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	autumnV2_3,
	canSendOneMore,
	DAILY_CAP,
	freePlan,
	track,
	uncappedPlan,
} from "./utils/usageAlertFreeTierDailyCap.js";

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

const expectAlertAtUsage = async ({
	customerId,
	threshold,
	usage,
	limit = DAILY_CAP,
}: {
	customerId: string;
	threshold: number;
	usage: number;
	limit?: number;
}) => {
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold,
		basis: "usage_limit",
	});
	expect(data.usage_alert.threshold_type).toBe("usage");
	expect(data.usage_limit).toMatchObject({
		limit,
		usage,
		remaining: limit - usage,
		interval: "day",
	});
	return data;
};

test(`${chalk.yellowBright("free-tier-cap4: an uncapped plan silences the alerts; the capped plan brings them back")}`, async () => {
	const customerId = "free-tier-cap-4";
	const capped = freePlan("free-tier-cap-plan-4");
	const uncapped = uncappedPlan("free-tier-uncapped-plan-4");
	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [capped, uncapped] }),
		],
		actions: [s.billing.attach({ productId: capped.id })],
	});

	await autumnV2_3.billing.attach({
		customer_id: customerId,
		plan_id: uncapped.id,
		redirect_mode: "if_required",
	});
	await track(customerId, 100);
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 80 });
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 100,
		timeoutMs: 2000,
	});

	await autumnV2_3.billing.attach({
		customer_id: customerId,
		plan_id: capped.id,
		redirect_mode: "if_required",
	});
	await track(customerId, 80);
	await expectAlertAtUsage({ customerId, threshold: 80, usage: 80 });
});

test(`${chalk.yellowBright("free-tier-cap5: a customer cap of 500 overrides the plan cap for the plan alerts")}`, async () => {
	const customerId = "free-tier-cap-5";
	const plan = freePlan("free-tier-cap-plan-5");
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit: 500,
		interval: ResetInterval.Day,
		anchor: "utc",
	});

	await track(customerId, 200);
	await expectAlertAtUsage({
		customerId,
		threshold: 80,
		usage: 200,
		limit: 500,
	});
	await expectAlertAtUsage({
		customerId,
		threshold: 100,
		usage: 200,
		limit: 500,
	});
	await expectAlertAtUsage({
		customerId,
		threshold: 200,
		usage: 200,
		limit: 500,
	});
	expect(await canSendOneMore(customerId)).toBe(true);
});

test(`${chalk.yellowBright("free-tier-cap6: a batch past the cap is clamped, fires 200 and limit_reached from one request")}`, async () => {
	const customerId = "free-tier-cap-6";
	const plan = freePlan("free-tier-cap-plan-6");
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await track(customerId, 190);
	await expectAlertAtUsage({ customerId, threshold: 100, usage: 190 });

	await track(customerId, 50);
	await expectAlertAtUsage({ customerId, threshold: 200, usage: 200 });
	const blocked = await waitForLimitReached({
		token: playToken,
		customerId,
		limitType: "usage_limit",
	});
	expect(blocked?.payload.data.usage_limit?.usage).toBe(DAILY_CAP);
	expect(await canSendOneMore(customerId)).toBe(false);
});

test(`${chalk.yellowBright("free-tier-cap7: a customer cap of 100 lowers the denominator and the 200 alert can never fire")}`, async () => {
	const customerId = "free-tier-cap-7";
	const plan = freePlan("free-tier-cap-plan-7");
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit: 100,
		interval: ResetInterval.Day,
		anchor: "utc",
	});

	await track(customerId, 80);
	await expectAlertAtUsage({
		customerId,
		threshold: 80,
		usage: 80,
		limit: 100,
	});

	await track(customerId, 150);
	await expectAlertAtUsage({
		customerId,
		threshold: 100,
		usage: 100,
		limit: 100,
	});
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 200 });
	expect(await canSendOneMore(customerId)).toBe(false);
});
