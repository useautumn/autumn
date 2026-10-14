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

test(`${chalk.yellowBright("usage-alert1b: usage threshold fires when usage lands exactly on threshold")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-threshold-exact-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-threshold-exact-1",
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
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result!.payload.data.usage_alert.threshold_type).toBe("usage");
});

test(`${chalk.yellowBright("usage-alert2: usage percentage threshold crossing triggers webhook")}`, async () => {
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

test(`${chalk.yellowBright("usage-alert2b: usage percentage threshold fires at exact percentage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-pct-exact-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-pct-exact-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 100,
				threshold_type: "usage_percentage",
				enabled: true,
			},
		],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1000,
	});

	const result = await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 100,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result!.payload.data.usage_alert.threshold_type).toBe(
		"usage_percentage",
	);
});

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

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await waitForWebhook<BalancesUsageAlertTriggeredPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 8000,
	});

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
		} catch {}
	}

	expect(matchCount).toBe(1);
});

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
			payload.data?.usage_alert?.threshold === 500,
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});

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
		} catch {}
	}
	expect(has800).toBe(false);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	const secondResult = await waitForWebhook<BalancesUsageAlertTriggeredPayload>(
		{
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.usage_alert?.threshold === 800,
			timeoutMs: 15000,
		},
	);

	expect(secondResult).not.toBeNull();
	expect(secondResult!.payload.data.usage_alert.threshold).toBe(800);
});

test(`${chalk.yellowBright("usage-alert6: remaining threshold crossing triggers webhook")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-remaining-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-remaining-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 200,
				threshold_type: "remaining",
				enabled: true,
			},
		],
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
			payload.data?.usage_alert?.threshold === 200,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.usage_alert_triggered");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.usage_alert.threshold).toBe(200);
	expect(data.usage_alert.threshold_type).toBe("remaining");
});

test(`${chalk.yellowBright("usage-alert7: remaining percentage threshold crossing triggers webhook")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "ua-remaining-pct-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "usage-alert-remaining-pct-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 20,
				threshold_type: "remaining_percentage",
				enabled: true,
			},
		],
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
			payload.data?.usage_alert?.threshold === 20,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.usage_alert_triggered");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.usage_alert.threshold).toBe(20);
	expect(data.usage_alert.threshold_type).toBe("remaining_percentage");
});
