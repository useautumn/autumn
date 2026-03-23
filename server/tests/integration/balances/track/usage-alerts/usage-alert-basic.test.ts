/**
 * Integration tests for usage alert webhooks.
 *
 * Verifies that `balances.usage_alert_triggered` webhooks fire correctly when
 * customer usage crosses configured thresholds (both absolute and percentage).
 *
 * Uses Svix Play to receive and verify webhooks.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	getPlayHistory,
	getTestSvixAppId,
	parseEventBody,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";

type BalancesUsageAlertTriggeredPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		usage_alert: {
			name?: string;
			threshold: number;
			threshold_type: string;
		};
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVIX PLAY SETUP
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Usage threshold crossing triggers webhook
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("usage-alert1: usage threshold crossing triggers webhook")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-threshold-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-threshold-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

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

	// Track 850 usage — crosses threshold of 800
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 850,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 800,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.usage_alert_triggered");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.usage_alert.threshold).toBe(800);
	expect(data.usage_alert.threshold_type).toBe("usage");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Usage percentage threshold crossing triggers webhook
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("usage-alert2: percentage threshold crossing triggers webhook")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-pct-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-pct-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 90,
				threshold_type: "usage_percentage",
				enabled: true,
			},
		],
	});

	// Track 950 usage — 95% of 1000 allowance, crosses 90% threshold
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 950,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 90,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.usage_alert_triggered");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.usage_alert.threshold).toBe(90);
	expect(data.usage_alert.threshold_type).toBe("usage_percentage");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Alert does not re-fire after already crossed
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("usage-alert3: alert does not re-fire after already crossed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-no-refire-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-no-refire-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 500,
				threshold_type: "usage",
				enabled: true,
			},
		],
	});

	// First track: 600 usage — crosses threshold of 500, expect webhook
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 600,
	});

	const firstResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 15000,
	});

	expect(firstResult).not.toBeNull();

	// Second track: 100 more usage — already crossed, should NOT fire again
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	// Wait briefly, then assert no second webhook arrived
	await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 8000,
	});

	// waitForWebhook scans all history — if it finds a match it's the same first one.
	// Count total matches to confirm only 1 exists.
	let matchCount = 0;
	const history = await getPlayHistory({ token: playToken });
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesUsageAlertTriggeredPayload>(event);
			if (
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.usage_alert?.threshold === 500
			) {
				matchCount++;
			}
		} catch {
			// Skip unparseable events
		}
	}

	// Should have exactly 1 webhook, not 2
	expect(matchCount).toBe(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Disabled alert does not fire
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("usage-alert4: disabled alert does not fire")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-disabled-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-disabled-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 500,
				threshold_type: "usage",
				enabled: false,
			},
		],
	});

	// Track 600 — crosses threshold, but alert is disabled
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 600,
	});

	// Wait and verify no webhook
	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Multiple alerts fire independently
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("usage-alert5: multiple alerts fire independently")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-multi-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-multi-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 500,
				threshold_type: "usage",
				enabled: true,
			},
			{
				feature_id: TestFeature.Messages,
				threshold: 800,
				threshold_type: "usage",
				enabled: true,
			},
		],
	});

	// Track 600 — crosses 500 but not 800
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 600,
	});

	const firstResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 15000,
	});

	expect(firstResult).not.toBeNull();
	expect(firstResult!.payload.data.usage_alert.threshold).toBe(500);

	// Verify 800 threshold has NOT fired yet
	await timeout(3000);

	let has800 = false;
	const historyMid = await getPlayHistory({ token: playToken });
	for (const event of historyMid.data) {
		try {
			const payload = parseEventBody<BalancesUsageAlertTriggeredPayload>(event);
			if (
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.usage_alert?.threshold === 800
			) {
				has800 = true;
			}
		} catch {
			// Skip
		}
	}
	expect(has800).toBe(false);

	// Track 300 more (total 900) — crosses 800 threshold
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	const secondResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 800,
		timeoutMs: 15000,
	});

	expect(secondResult).not.toBeNull();
	expect(secondResult!.payload.data.usage_alert.threshold).toBe(800);
});
