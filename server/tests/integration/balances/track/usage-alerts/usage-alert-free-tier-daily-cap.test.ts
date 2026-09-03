/**
 * Mirrors the free-tier setup this feature was built for: the plan carries a
 * 200/day cap and three plan-level usage_limit alerts at 80, 100 and 200.
 * Every customer on the plan inherits both; nothing is configured per customer.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ApiVersion, ms, ResetInterval } from "@autumn/shared";
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
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	countLimitReachedWebhooks,
	waitForLimitReached,
} from "../../utils/limit-reached-utils/limitReachedWebhookUtils.js";
import {
	countUsageAlertWebhooks,
	expectNoUsageAlert,
	listUsageAlertWebhooks,
	waitForNextMinuteBucket,
	waitForUsageAlert,
	waitForUsageAlertCount,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expectUsageLimitWindowContains } from "../../utils/usage-limit-utils/expectUsageLimitWindowContains.js";
import { expireUsageWindowForReset } from "../../utils/usage-limit-utils/expireUsageWindowForReset.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const DAILY_CAP = 200;
const ALERT_THRESHOLDS = [80, 100, 200] as const;

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

const freePlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
		billingControls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					limit: DAILY_CAP,
					interval: ResetInterval.Day,
					anchor: "utc",
				},
			],
			usage_alerts: ALERT_THRESHOLDS.map((threshold) => ({
				feature_id: TestFeature.Messages,
				basis: "usage_limit",
				threshold_type: "usage",
				threshold,
				enabled: true,
			})),
		},
	});

const uncappedPlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});

const track = (customerId: string, value: number) =>
	autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value,
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

const canSendOneMore = async (customerId: string) => {
	const check = await autumnV2_3.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	return check.allowed;
};

test(`${chalk.yellowBright("free-tier-cap1: 80, 100 and 200 emails fire in order, 200 also blocks")}`, async () => {
	const customerId = "free-tier-cap-1";
	const plan = freePlan("free-tier-cap-plan-1");
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const trackedAt = Date.now();
	await track(customerId, 80);
	const first = await expectAlertAtUsage({
		customerId,
		threshold: 80,
		usage: 80,
	});
	expectUsageLimitWindowContains({
		usageLimit: first.usage_limit,
		at: trackedAt,
		intervalMs: ms.days(1),
	});
	expect(await canSendOneMore(customerId)).toBe(true);

	await track(customerId, 20);
	await expectAlertAtUsage({ customerId, threshold: 100, usage: 100 });

	await track(customerId, 100);
	await expectAlertAtUsage({ customerId, threshold: 200, usage: 200 });
	const blocked = await waitForLimitReached({
		token: playToken,
		customerId,
		limitType: "usage_limit",
	});
	expect(blocked?.payload.data.usage_limit).toMatchObject({
		limit: DAILY_CAP,
		usage: DAILY_CAP,
		remaining: 0,
	});
	expect(await canSendOneMore(customerId)).toBe(false);

	await track(customerId, 1);
	await timeout(3000);
	for (const threshold of ALERT_THRESHOLDS) {
		expect(
			await countUsageAlertWebhooks({
				token: playToken,
				customerId,
				threshold,
			}),
		).toBe(1);
	}
});

test(`${chalk.yellowBright("free-tier-cap2: one batch of 150 fires 80 and 100 together, not 200")}`, async () => {
	const customerId = "free-tier-cap-2";
	const plan = freePlan("free-tier-cap-plan-2");
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await track(customerId, 150);
	await expectAlertAtUsage({ customerId, threshold: 80, usage: 150 });
	await expectAlertAtUsage({ customerId, threshold: 100, usage: 150 });
	await expectNoUsageAlert({ token: playToken, customerId, threshold: 200 });
});

test(`${chalk.yellowBright("free-tier-cap3: the next day re-arms every threshold with a new window")}`, async () => {
	const customerId = "free-tier-cap-3";
	const plan = freePlan("free-tier-cap-plan-3");
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await track(customerId, 200);
	const yesterday = await expectAlertAtUsage({
		customerId,
		threshold: 200,
		usage: 200,
	});
	expect(await canSendOneMore(customerId)).toBe(false);

	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(await canSendOneMore(customerId)).toBe(true);

	await waitForNextMinuteBucket();
	await track(customerId, 80);
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 80,
		count: 2,
	});
	const today = (
		await listUsageAlertWebhooks({
			token: playToken,
			customerId,
			threshold: 80,
		})
	).find((alert) => alert.usage_limit?.usage === 80);
	expect(today?.usage_limit?.remaining).toBe(DAILY_CAP - 80);
	expect(yesterday.usage_limit?.usage).toBe(DAILY_CAP);

	await track(customerId, 120);
	await waitForUsageAlertCount({
		token: playToken,
		customerId,
		threshold: 200,
		count: 2,
	});
	expect(
		await countLimitReachedWebhooks({
			token: playToken,
			customerId,
			limitType: "usage_limit",
		}),
	).toBe(2);
});

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
