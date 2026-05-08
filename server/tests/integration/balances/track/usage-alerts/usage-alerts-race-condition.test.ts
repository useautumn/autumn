/**
 * Replication test for duplicate balances.usage_alert_triggered webhooks
 * fired by concurrent /v1/track requests crossing the same threshold.
 *
 * Expectation: within 2 minutes, exactly 2 matching webhook events arrive.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { LimitedItem } from "@autumn/shared";
import { setCustomerUsageAlerts } from "@tests/integration/balances/utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

type BalancesUsageAlertTriggeredPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		usage_alert: {
			threshold: number;
			threshold_type: string;
		};
	};
};

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

test(`${chalk.yellowBright("usage-alert race: concurrent tracks fire two webhooks crossing the same threshold")}`, async () => {
	const creditsItem = constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage: 100,
	}) as LimitedItem;

	const product = constructProduct({
		type: "pro",
		isDefault: false,
		items: [creditsItem],
		id: "ua-race-condition-pro",
	});

	const threshold = 20;

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-race-condition",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [s.attach({ productId: product.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Credits,
				threshold,
				threshold_type: "remaining",
				enabled: true,
			},
		],
	});

	// Stage balance just above the threshold so two concurrent small deductions
	// can both observe the pre-crossing snapshot and both fire the alert.
	// action1 credit_cost = 0.2 → 395 units = 79 credits used → remaining = 21.
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 395,
	});

	// Worst-case stress: many concurrent tracks crossing the SAME threshold.
	// Each value is tiny (0.5–1.0 credits) so every track on its own would cross
	// remaining=21 → below 20, meaning every handler would naively fire the alert.
	// Going negative on remaining is fine for this test — only the FIRST crossing
	// of the threshold should fire; subsequent reads see oldRemaining<20 already.
	const BURST_SIZE = 500;
	await Promise.all(
		Array.from({ length: BURST_SIZE }, (_, i) =>
			autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Credits,
				value: 0.5 + (i % 50) * 0.01,
			}),
		),
	);

	// Wait long enough for any duplicate webhooks to surface, then assert exactly one.
	const SETTLE_MS = 30_000;
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

	const history = await getPlayHistory({ token: playToken });
	const matching = history.data
		.map((event) => parseEventBody<BalancesUsageAlertTriggeredPayload>(event))
		.filter(
			(payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.feature_id === TestFeature.Credits &&
				payload.data?.usage_alert?.threshold === threshold,
		);

	expect(matching.length).toBe(1);
}, 150_000);
