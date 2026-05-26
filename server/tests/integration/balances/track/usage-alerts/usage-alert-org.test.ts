/**
 * TDD test for org-level usage alerts.
 *
 * Contract under test:
 *   New types/fields:
 *     - OrgConfig.usage_alerts: DbUsageAlert[]   (org-scope alerts in organizations.config)
 *   New behaviors:
 *     - checkUsageAlerts evaluates ctx.org.config.usage_alerts in addition to
 *       customer-level and entity-level alerts.
 *     - Org alerts fire INDEPENDENTLY of customer alerts (idempotency key
 *       takes a scope segment so Svix does not dedup them).
 *     - Org alerts evaluate against the customer-level balance only — they do
 *       not iterate per entity.
 *     - Disabled org alerts (enabled: false) do not fire.
 *     - Org alert with no feature_id fires on usage of any feature (global).
 *   Side effects:
 *     - Svix `balances.usage_alert_triggered` event per customer per
 *       (scope, feature, threshold, threshold_type) per minute-bucket.
 *
 * Pre-impl red:
 *   - OrgConfig.usage_alerts type doesn't exist → TS error on the org config
 *     update payload.
 *   - checkUsageAlerts does not read ctx.org.config.usage_alerts → no webhook
 *     fires → waitForWebhook returns null → assertions fail.
 *
 * Post-impl green: all assertions pass once OrgConfigSchema includes
 * usage_alerts and checkUsageAlerts iterates ctx.org.config.usage_alerts as a
 * third scope.
 */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { DbUsageAlert } from "@autumn/shared";
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
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { db } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { setCustomerUsageAlerts } from "../../utils/usage-alert-utils/customerUsageAlertUtils.js";

type BalancesUsageAlertTriggeredPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		entity_id?: string;
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
	const appId = getTestSvixAppId({ svixConfig: defaultCtx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["balances.usage_alert_triggered"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
	// Final reset to ensure config doesn't leak to other suites.
	await setOrgUsageAlerts([]);
});

// Each test sets the org-level alerts then clears them in afterEach so tests
// can run sequentially without bleeding across each other.
afterEach(async () => {
	await setOrgUsageAlerts([]);
});

async function setOrgUsageAlerts(usageAlerts: DbUsageAlert[]) {
	await OrgService.update({
		db,
		orgId: defaultCtx.org.id,
		updates: {
			config: {
				...defaultCtx.org.config,
				usage_alerts: usageAlerts,
			},
		},
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Org-level alert fires when customer crosses threshold
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("org-alert1: org-level alert fires when customer crosses threshold")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-threshold-1",
		items: [messagesItem],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 750,
			threshold_type: "usage",
			enabled: true,
			name: "org-threshold-750",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-threshold-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

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
			payload.data?.usage_alert?.threshold === 750 &&
			payload.data?.usage_alert?.name === "org-threshold-750",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.usage_alert.threshold).toBe(750);
	expect(data.usage_alert.threshold_type).toBe("usage");
	expect(data.usage_alert.name).toBe("org-threshold-750");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Org alert applies to ALL customers (not customer-specific)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("org-alert2: org-level alert fires for multiple customers independently")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-multi-customer-1",
		items: [messagesItem],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 600,
			threshold_type: "usage",
			enabled: true,
			name: "org-multi-cust",
		},
	]);

	const { customerId: customerIdA, autumnV2_1: autumnA } = await initScenario({
		customerId: "org-usage-alert-multi-a",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	const { customerId: customerIdB, autumnV2_1: autumnB } = await initScenario({
		customerId: "org-usage-alert-multi-b",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnA.track({
		customer_id: customerIdA,
		feature_id: TestFeature.Messages,
		value: 700,
	});
	await autumnB.track({
		customer_id: customerIdB,
		feature_id: TestFeature.Messages,
		value: 700,
	});

	const resultA = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerIdA &&
			payload.data?.usage_alert?.threshold === 600 &&
			payload.data?.usage_alert?.name === "org-multi-cust",
		timeoutMs: 15000,
	});
	const resultB = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerIdB &&
			payload.data?.usage_alert?.threshold === 600 &&
			payload.data?.usage_alert?.name === "org-multi-cust",
		timeoutMs: 15000,
	});

	expect(resultA).not.toBeNull();
	expect(resultB).not.toBeNull();
	expect(resultA!.payload.data.customer_id).toBe(customerIdA);
	expect(resultB!.payload.data.customer_id).toBe(customerIdB);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Org alert + customer alert at same threshold both fire independently
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("org-alert3: org and customer alerts at same threshold both fire")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-coexist-1",
		items: [messagesItem],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 400,
			threshold_type: "usage",
			enabled: true,
			name: "org-coexist",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-coexist-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 400,
				threshold_type: "usage",
				enabled: true,
				name: "customer-coexist",
			},
		],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	await timeout(5000);

	const history = await getPlayHistory({ token: playToken });
	let orgMatch = 0;
	let customerMatch = 0;
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesUsageAlertTriggeredPayload>(event);
			if (
				payload.type !== "balances.usage_alert_triggered" ||
				payload.data?.customer_id !== customerId ||
				payload.data?.usage_alert?.threshold !== 400
			)
				continue;
			if (payload.data.usage_alert.name === "org-coexist") orgMatch++;
			if (payload.data.usage_alert.name === "customer-coexist") customerMatch++;
		} catch {
			// skip unparseable
		}
	}

	expect(orgMatch).toBe(1);
	expect(customerMatch).toBe(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Org alert with no feature_id (global) fires on any feature
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("org-alert4: org-level global alert (no feature_id) fires on any feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-global-1",
		items: [messagesItem],
	});

	await setOrgUsageAlerts([
		{
			threshold: 80,
			threshold_type: "usage_percentage",
			enabled: true,
			name: "org-global",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-global-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 900,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "org-global",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result!.payload.data.feature_id).toBe(TestFeature.Messages);
	expect(result!.payload.data.usage_alert.threshold).toBe(80);
	expect(result!.payload.data.usage_alert.threshold_type).toBe(
		"usage_percentage",
	);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Disabled org-level alert does not fire
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("org-alert5: disabled org-level alert does not fire")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-disabled-1",
		items: [messagesItem],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 300,
			threshold_type: "usage",
			enabled: false,
			name: "org-disabled",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-disabled-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "org-disabled",
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});
