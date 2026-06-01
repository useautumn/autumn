/**
 * TDD coverage for env-discriminated org usage alerts.
 *
 * Contract under test:
 *   New types/fields:
 *     - OrgConfig.sandbox_usage_alerts: DbUsageAlert[]
 *   New behaviors:
 *     - In sandbox env, checkUsageAlerts reads ctx.org.config.sandbox_usage_alerts.
 *     - In sandbox env, ctx.org.config.usage_alerts (the live field) is IGNORED
 *       — alerts on it do NOT fire.
 *   Side effects:
 *     - A sandbox_usage_alerts entry produces a Svix balances.usage_alert_triggered
 *       webhook when its threshold is crossed.
 *     - A usage_alerts entry alone produces NO webhook when the runtime is sandbox.
 *
 * Pre-impl red:
 *   - OrgConfig.sandbox_usage_alerts type doesn't exist → TS error.
 *   - checkUsageAlerts still reads ctx.org.config.usage_alerts unconditionally,
 *     so test 2 (which expects no webhook from usage_alerts in sandbox) fails.
 *
 * Post-impl green: both behaviors hold once OrgConfigSchema gains
 * sandbox_usage_alerts and checkUsageAlerts switches on ctx.env.
 */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { DbUsageAlert } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { db } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

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
	await setOrgAlerts({ sandbox: [], live: [] });
});

afterEach(async () => {
	await setOrgAlerts({ sandbox: [], live: [] });
});

async function setOrgAlerts({
	sandbox,
	live,
}: {
	sandbox: DbUsageAlert[];
	live: DbUsageAlert[];
}) {
	await OrgService.update({
		db,
		orgId: defaultCtx.org.id,
		updates: {
			config: {
				...defaultCtx.org.config,
				sandbox_usage_alerts: sandbox,
				usage_alerts: live,
			},
		},
	});
}

// ── Contract assertion 1: sandbox_usage_alerts fires in sandbox env ──

test(`${chalk.yellowBright("org-alert-env1: sandbox_usage_alerts triggers webhook in sandbox env")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-env-sandbox-fires",
		items: [messagesItem],
	});

	await setOrgAlerts({
		sandbox: [
			{
				feature_id: TestFeature.Messages,
				threshold: 500,
				threshold_type: "usage",
				enabled: true,
				name: "sandbox-only-alert",
			},
		],
		live: [],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-env-sandbox-fires",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 600,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "sandbox-only-alert",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result!.payload.data.usage_alert.threshold).toBe(500);
});

// ── Contract assertion 2: usage_alerts (live field) does NOT fire in sandbox ──

test(`${chalk.yellowBright("org-alert-env2: usage_alerts (live field) is ignored in sandbox env")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-env-live-ignored",
		items: [messagesItem],
	});

	await setOrgAlerts({
		sandbox: [],
		live: [
			{
				feature_id: TestFeature.Messages,
				threshold: 400,
				threshold_type: "usage",
				enabled: true,
				name: "live-only-alert-should-not-fire",
			},
		],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-env-live-ignored",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 700,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "live-only-alert-should-not-fire",
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});

// ── Contract assertion 3: only the sandbox entry fires when both fields are set ──

test(`${chalk.yellowBright("org-alert-env3: with both fields set in sandbox, only sandbox_usage_alerts triggers")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const prod = products.base({
		id: "org-ua-env-both-set",
		items: [messagesItem],
	});

	await setOrgAlerts({
		sandbox: [
			{
				feature_id: TestFeature.Messages,
				threshold: 300,
				threshold_type: "usage",
				enabled: true,
				name: "sandbox-side",
			},
		],
		live: [
			{
				feature_id: TestFeature.Messages,
				threshold: 300,
				threshold_type: "usage",
				enabled: true,
				name: "live-side",
			},
		],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-usage-alert-env-both",
		setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
		actions: [s.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const sandboxResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "sandbox-side",
		timeoutMs: 15000,
	});
	expect(sandboxResult).not.toBeNull();

	const liveResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "live-side",
		timeoutMs: 6000,
	});
	expect(liveResult).toBeNull();
});
