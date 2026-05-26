/**
 * TDD test for org-level usage_percentage alerts with thresholds > 100%.
 *
 * Red-failure mode (pre-fix):
 *  - DbUsageAlertSchema.check() in shared/models/cusModels/billingControls/usageAlert.ts
 *    rejected threshold > 100 for usage_percentage (and remaining_percentage),
 *    so OrgConfigSchema.parse on next ctx.org read would throw and no
 *    track request would even reach checkUsageAlerts.
 *
 * Green-success criteria (post-fix):
 *  - usage_percentage thresholds > 100 (e.g. 200, 300) are accepted.
 *  - With overage_allowed enabled on a consumable feature, usage can exceed
 *    granted; when it crosses N% the org-level alert at N% fires.
 *  - remaining_percentage stays capped at 100 (semantically remaining cannot
 *    exceed granted).
 */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { DbUsageAlert } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { setCustomerOverageAllowed } from "@tests/integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";
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
	await setOrgUsageAlerts([]);
});

afterEach(async () => {
	await setOrgUsageAlerts([]);
});

async function setOrgUsageAlerts(usageAlerts: DbUsageAlert[]) {
	// Tests run in AppEnv.Sandbox — checkUsageAlerts reads
	// sandbox_usage_alerts, not the live `usage_alerts` field.
	await OrgService.update({
		db,
		orgId: defaultCtx.org.id,
		updates: {
			config: {
				...defaultCtx.org.config,
				sandbox_usage_alerts: usageAlerts,
			},
		},
	});
}

test(`${chalk.yellowBright("org-pct-200: usage_percentage threshold of 200% fires when customer is at 250%")}`, async () => {
	const prod = products.base({
		id: "org-ua-pct-200",
		items: [items.consumableMessages({ includedUsage: 1000, price: 0.1 })],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 200,
			threshold_type: "usage_percentage",
			enabled: true,
			name: "org-200pct",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-ua-pct-200-cust",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	// 2500 of 1000 allowance = 250% usage → crosses 200% threshold
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 2500,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "org-200pct",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result!.payload.data.usage_alert.threshold).toBe(200);
	expect(result!.payload.data.usage_alert.threshold_type).toBe(
		"usage_percentage",
	);
});

test(`${chalk.yellowBright("org-pct-300: usage_percentage threshold of 300% fires when customer is at 350%")}`, async () => {
	const prod = products.base({
		id: "org-ua-pct-300",
		items: [items.consumableMessages({ includedUsage: 1000, price: 0.1 })],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 300,
			threshold_type: "usage_percentage",
			enabled: true,
			name: "org-300pct",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-ua-pct-300-cust",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	// 3500 of 1000 allowance = 350% usage → crosses 300% threshold
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 3500,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "org-300pct",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result!.payload.data.usage_alert.threshold).toBe(300);
	expect(result!.payload.data.usage_alert.threshold_type).toBe(
		"usage_percentage",
	);
});

test(`${chalk.yellowBright("org-pct-200-not-yet: usage_percentage threshold of 200% does NOT fire at 150%")}`, async () => {
	const prod = products.base({
		id: "org-ua-pct-200-not-yet",
		items: [items.consumableMessages({ includedUsage: 1000, price: 0.1 })],
	});

	await setOrgUsageAlerts([
		{
			feature_id: TestFeature.Messages,
			threshold: 200,
			threshold_type: "usage_percentage",
			enabled: true,
			name: "org-200pct-not-yet",
		},
	]);

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "org-ua-pct-200-not-yet-cust",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	// 1500 of 1000 allowance = 150% — below 200% threshold
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1500,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.name === "org-200pct-not-yet",
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});
