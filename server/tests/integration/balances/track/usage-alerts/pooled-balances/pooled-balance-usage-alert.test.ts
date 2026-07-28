// Customer usage-percentage alerts use the aggregate grant across pooled entities.
// Tracking through one entity fires when total pooled usage reaches the threshold.

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import {
	buildPooledBalanceTestProducts,
	pooledBalanceTestValues,
} from "@tests/integration/balances/utils/pooledBalanceTestProducts.js";
import { setCustomerUsageAlerts } from "@tests/integration/balances/utils/usage-alert-utils/customerUsageAlertUtils.js";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import {
	getTestSvixAppId,
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

type UsageAlertPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		entity_id?: string;
		usage_alert: { threshold: number; threshold_type: string };
	};
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["balances.usage_alert_triggered"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(
	`${chalk.yellowBright("pooled usage alert: three Pro entities trigger at 50% of the customer pool")}`,
	async () => {
		const pooledMessages = (includedUsage: number) => ({
			...items.monthlyMessages({ includedUsage }),
			pooled: true,
		});
		const proEntityPlan = products.pro({
			id: "pooled-usage-alert-three-pro",
			items: [pooledMessages(10_000)],
		});
		const { autumnV2_1, autumnV2_2, customerId, entities, ctx: scenarioCtx } =
			await initScenario({
				customerId: "pooled-usage-alert-three-pro",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
					s.entities({ count: 3, featureId: TestFeature.Users }),
					s.products({ list: [proEntityPlan] }),
				],
				actions: [
					s.billing.attach({
						productId: proEntityPlan.id,
						entityIndex: 0,
						items: [items.monthlyPrice(), pooledMessages(80_000)],
					}),
					s.billing.attach({ productId: proEntityPlan.id, entityIndex: 1 }),
					s.billing.attach({ productId: proEntityPlan.id, entityIndex: 2 }),
				],
			});

		const pooledState = await expectPooledBalanceCorrect({
			db: scenarioCtx.db,
			customerId,
			pool: {
				balance: 100_000,
				adjustment: 0,
				granted: 100_000,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Subscription,
				stripeSubscriptionId: "stripe_subscription",
			},
			contributions: { count: 3 },
			sources: { count: 3, balance: 0, adjustment: 0 },
		});
		expect(
			pooledState.contributions
				.map(({ current_contribution }) => current_contribution)
				.sort((a, b) => a - b),
		).toEqual([10_000, 10_000, 80_000]);
		await expectStripeSubscriptionCorrect({ ctx: scenarioCtx, customerId });

		await setCustomerUsageAlerts({
			autumn: autumnV2_1,
			customerId,
			usageAlerts: [
				{
					feature_id: TestFeature.Messages,
					threshold: 50,
					threshold_type: "usage_percentage",
					enabled: true,
				},
			],
		});
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 50_000,
		});

		const event = await waitForWebhook<UsageAlertPayload>({
			token: webhook.playToken,
			predicate: (payload) =>
				payload.type === "balances.usage_alert_triggered" &&
				payload.data?.customer_id === customerId &&
				payload.data?.feature_id === TestFeature.Messages &&
				payload.data?.entity_id === undefined &&
				payload.data?.usage_alert?.threshold === 50 &&
				payload.data?.usage_alert?.threshold_type === "usage_percentage",
			timeoutMs: 15_000,
		});
		expect(event).not.toBeNull();

		await timeout(2_000);
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 100_000,
			remaining: 50_000,
			usage: 50_000,
			breakdownCount: 1,
		});
	},
);

test(`${chalk.yellowBright("pooled usage alert: free-to-Pro aggregate fires at exactly 50% usage")}`, async () => {
	const { freeEntityPlan, proEntityPlan } = buildPooledBalanceTestProducts({
		idPrefix: "pooled-usage-alert",
	});
	const { autumnV2_1, autumnV2_2, customerId, entities } = await initScenario({
		customerId: "pooled-usage-alert",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [freeEntityPlan, proEntityPlan] }),
		],
		actions: [
			s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 0 }),
			s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 1 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 40,
				entityIndex: 1,
				timeout: 2_000,
			}),
		],
	});
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: proEntityPlan.id,
		plan_schedule: "immediate",
	});
	await setCustomerUsageAlerts({
		autumn: autumnV2_1,
		customerId,
		usageAlerts: [
			{
				feature_id: TestFeature.Messages,
				threshold: 50,
				threshold_type: "usage_percentage",
				enabled: true,
			},
		],
	});
	await autumnV2_2.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 35,
	});
	const event = await waitForWebhook<UsageAlertPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === "balances.usage_alert_triggered" &&
			payload.data?.customer_id === customerId &&
			payload.data?.feature_id === TestFeature.Messages &&
			payload.data?.entity_id === undefined &&
			payload.data?.usage_alert?.threshold === 50 &&
			payload.data?.usage_alert?.threshold_type === "usage_percentage",
		timeoutMs: 15_000,
	});
	expect(event).not.toBeNull();

	await timeout(2_000);
	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		granted:
			pooledBalanceTestValues.freeContribution +
			pooledBalanceTestValues.proContribution,
		remaining: 75,
		usage: 75,
		breakdownCount: 2,
	});
});
