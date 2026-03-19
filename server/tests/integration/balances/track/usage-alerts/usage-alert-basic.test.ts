/**
 * Integration tests for usage alert webhooks.
 *
 * Verifies that `balances.threshold_reached` webhooks fire correctly when
 * customer usage crosses configured thresholds (both absolute and percentage).
 *
 * Uses Svix Play to receive and verify webhooks.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	generatePlayToken,
	getPlayWebhookUrl,
	waitForWebhook,
} from "@tests/integration/billing/autumn-webhooks/utils/svixPlayClient.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";
import {
	createUsageAlertTestEndpoint,
	deleteUsageAlertTestEndpoint,
} from "../../utils/usage-alert-utils/svixUsageAlertEndpoint.js";

type BalancesThresholdReachedPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		threshold_type: string;
		usage_alert?: {
			name?: string;
			threshold: number;
			threshold_type: string;
		};
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVIX PLAY SETUP
// ═══════════════════════════════════════════════════════════════════════════════

let playToken: string;
let endpointId: string;

beforeAll(async () => {
	playToken = await generatePlayToken();
	console.log(`Generated Svix Play token: ${playToken}`);

	const svixAppId = ctx.org.svix_config?.sandbox_app_id;
	if (!svixAppId) {
		throw new Error(
			"Test org does not have svix_config.sandbox_app_id configured. " +
				"Cannot run webhook integration tests without Svix app.",
		);
	}

	const playUrl = getPlayWebhookUrl(playToken);
	console.log(`Creating Svix endpoint: ${playUrl}`);
	endpointId = await createUsageAlertTestEndpoint({
		appId: svixAppId,
		playUrl,
	});
	console.log(`Created Svix endpoint: ${endpointId}`);
});

afterAll(async () => {
	const svixAppId = ctx.org.svix_config?.sandbox_app_id;
	if (svixAppId && endpointId) {
		await deleteUsageAlertTestEndpoint({ appId: svixAppId, endpointId });
		console.log(`Deleted Svix endpoint: ${endpointId}`);
	}
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
				threshold_type: "usage_threshold",
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

	const result = await waitForWebhook<BalancesThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.threshold_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.threshold_type === "usage_alert" &&
			payload.data?.usage_alert?.threshold === 800,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.threshold_reached");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.threshold_type).toBe("usage_alert");
	expect(data.usage_alert).toBeDefined();
	expect(data.usage_alert!.threshold).toBe(800);
	expect(data.usage_alert!.threshold_type).toBe("usage_threshold");
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
				threshold_type: "usage_percentage_threshold",
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

	const result = await waitForWebhook<BalancesThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.threshold_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.threshold_type === "usage_alert" &&
			payload.data?.usage_alert?.threshold === 90,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.threshold_reached");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.threshold_type).toBe("usage_alert");
	expect(data.usage_alert).toBeDefined();
	expect(data.usage_alert!.threshold).toBe(90);
	expect(data.usage_alert!.threshold_type).toBe("usage_percentage_threshold");
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
				threshold_type: "usage_threshold",
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

	const firstResult = await waitForWebhook<BalancesThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.threshold_reached" &&
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

	// Wait and check — should NOT find a second webhook
	// (waitForWebhook returns all history, so we count matching events)
	await timeout(5000);

	let matchCount = 0;
	const { getPlayHistory, parseEventBody } = await import(
		"@tests/integration/billing/autumn-webhooks/utils/svixPlayClient.js"
	);
	const history = await getPlayHistory({ token: playToken });
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesThresholdReachedPayload>(event);
			if (
				payload.type === "balances.threshold_reached" &&
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
				threshold_type: "usage_threshold",
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
	const result = await waitForWebhook<BalancesThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.threshold_reached" &&
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
				threshold_type: "usage_threshold",
				enabled: true,
			},
			{
				feature_id: TestFeature.Messages,
				threshold: 800,
				threshold_type: "usage_threshold",
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

	const firstResult = await waitForWebhook<BalancesThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.threshold_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 15000,
	});

	expect(firstResult).not.toBeNull();
	expect(firstResult!.payload.data.usage_alert!.threshold).toBe(500);

	// Verify 800 threshold has NOT fired yet
	await timeout(3000);

	const { getPlayHistory, parseEventBody } = await import(
		"@tests/integration/billing/autumn-webhooks/utils/svixPlayClient.js"
	);

	let has800 = false;
	const historyMid = await getPlayHistory({ token: playToken });
	for (const event of historyMid.data) {
		try {
			const payload = parseEventBody<BalancesThresholdReachedPayload>(event);
			if (
				payload.type === "balances.threshold_reached" &&
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

	const secondResult = await waitForWebhook<BalancesThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.threshold_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 800,
		timeoutMs: 15000,
	});

	expect(secondResult).not.toBeNull();
	expect(secondResult!.payload.data.usage_alert!.threshold).toBe(800);
});
