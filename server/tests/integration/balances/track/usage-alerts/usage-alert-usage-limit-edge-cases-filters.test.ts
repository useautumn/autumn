import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type CustomerBillingControls,
	ResetInterval,
	usageLimitFilterKey,
} from "@autumn/shared";
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
import { waitForLimitReached } from "../../utils/limit-reached-utils/limitReachedWebhookUtils.js";
import {
	expectNoUsageAlert,
	waitForUsageAlert,
} from "../../utils/usage-alert-utils/usageAlertWebhookUtils.js";
import {
	autumnV2_3,
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

const dailyCap = ({
	limit,
	filter,
	enabled = true,
}: {
	limit: number;
	filter?: { properties: Record<string, string> };
	enabled?: boolean;
}) => ({
	feature_id: TestFeature.Messages,
	limit,
	interval: ResetInterval.Day,
	anchor: "utc" as const,
	enabled,
	...(filter && { filter }),
});

const setCustomerBillingControls = async ({
	customerId,
	billingControls,
}: {
	customerId: string;
	billingControls: CustomerBillingControls;
}) => {
	await timeout(2000);
	await autumnV2_3.customers.update(customerId, {
		billing_controls: billingControls,
	});
	await timeout(3000);
};

const setupUncappedCustomer = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
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
};

test(`${chalk.yellowBright("ul-edge5: a broad and a narrow filtered cap both count one event and alert independently")}`, async () => {
	const customerId = "ul-edge-filter-superset-1";
	await setupUncappedCustomer({
		customerId,
		planId: "ul-edge-filter-superset",
	});
	const broad = { properties: { region: "eu" } };
	const narrow = { properties: { region: "eu", apiKeyId: "key-a" } };
	await setCustomerBillingControls({
		customerId,
		billingControls: {
			usage_limits: [
				dailyCap({ limit: 100, filter: broad }),
				dailyCap({ limit: 100, filter: narrow }),
			],
			usage_alerts: [
				usageLimitAlert({ threshold: 80, filter: broad }),
				usageLimitAlert({ threshold: 80, filter: narrow }),
			],
		} as CustomerBillingControls,
	});

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 80,
		properties: { region: "eu", apiKeyId: "key-a", extra: "ignored" },
	});
	const broadFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: usageLimitFilterKey(broad),
	});
	const narrowFire = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: usageLimitFilterKey(narrow),
	});
	expect(broadFire.usage_limit?.usage).toBe(80);
	expect(narrowFire.usage_limit?.usage).toBe(80);

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
		properties: { region: "eu", apiKeyId: "key-a" },
	});
	const blocked = await waitForLimitReached({
		token: playToken,
		customerId,
		limitType: "usage_limit",
	});
	expect(blocked?.payload.data.usage_limit?.usage).toBe(100);
	expect(blocked?.payload.data.filter).toBeDefined();
});

test(`${chalk.yellowBright("ul-edge6: boolean filter values canonicalise the same way on the cap, the alert and the event")}`, async () => {
	const customerId = "ul-edge-boolean-filter-1";
	await setupUncappedCustomer({ customerId, planId: "ul-edge-boolean-filter" });
	const booleanFilter = { properties: { internal: true } } as unknown as {
		properties: Record<string, string>;
	};
	await setCustomerBillingControls({
		customerId,
		billingControls: {
			usage_limits: [dailyCap({ limit: 100, filter: booleanFilter })],
			usage_alerts: [
				usageLimitAlert({
					threshold: 80,
					filter: { properties: { internal: "true" } },
				}),
			],
		} as CustomerBillingControls,
	});

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 80,
		properties: { internal: true },
	});
	const data = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "internal=true",
	});
	expect(data.usage_limit?.usage).toBe(80);
});

test(`${chalk.yellowBright("ul-edge7: disabling a filtered cap silences only the alert that points at it")}`, async () => {
	const customerId = "ul-edge-filtered-cap-disabled-1";
	await setupUncappedCustomer({
		customerId,
		planId: "ul-edge-filtered-cap-disabled",
	});
	const keyA = { properties: { apiKeyId: "key-a" } };
	await setCustomerBillingControls({
		customerId,
		billingControls: {
			usage_limits: [
				dailyCap({ limit: 100 }),
				dailyCap({ limit: 50, filter: keyA, enabled: false }),
			],
			usage_alerts: [
				usageLimitAlert({ threshold: 80 }),
				usageLimitAlert({ threshold: 80, filter: keyA }),
			],
		} as CustomerBillingControls,
	});

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 80,
		properties: keyA.properties,
	});
	const unfiltered = await waitForUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: "",
	});
	expect(unfiltered.usage_limit?.limit).toBe(100);
	await expectNoUsageAlert({
		token: playToken,
		customerId,
		threshold: 80,
		filterKey: usageLimitFilterKey(keyA),
	});
});
