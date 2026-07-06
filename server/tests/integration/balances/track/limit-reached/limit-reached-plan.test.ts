/**
 * Integration tests for the `balances.limit_reached` webhook when the limit is
 * configured at the PLAN level (billing controls on the attached product),
 * rather than on the customer.
 *
 * Reproduces Resend's setup: their spend limits live on the plan
 * ("Transactional Pro" > billing controls), e.g. an absolute overage cap and a
 * `usage_percentage` overage cap. Enforcement blocks the track correctly, but
 * the webhook must also fire — the check path merges plan-level billing
 * controls into the evaluated subject, so the track-webhook path must too.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BalancesLimitReachedPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		limit_type: string;
		entity_id?: string;
	};
};

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["balances.limit_reached"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: plan-level absolute spend limit reached fires webhook
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("limit-reached-plan1: plan-level absolute spend_limit fires webhook")}`,
	async () => {
		const consumableMsg = items.consumableMessages({
			includedUsage: 50,
			price: 1,
		});
		const planProd = products.base({
			id: "lr-plan-abs-spend-1",
			items: [consumableMsg],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit_type: "absolute",
						overage_limit: 10,
					},
				],
			},
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "lr-plan-abs-spend-cus-1",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [planProd] }),
			],
			actions: [s.attach({ productId: planProd.id })],
		});

		// included 50 + overage cap 10 → allowed up to 60; 60 lands exactly on the cap.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});

		const result = await waitForWebhook<BalancesLimitReachedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === customerId &&
				payload.data?.limit_type === "spend_limit",
			timeoutMs: 15000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;
		expect(data.customer_id).toBe(customerId);
		expect(data.feature_id).toBe(TestFeature.Messages);
		expect(data.limit_type).toBe("spend_limit");
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: plan-level usage_percentage spend limit reached fires webhook
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("limit-reached-plan2: plan-level usage_percentage spend_limit fires webhook")}`,
	async () => {
		const consumableMsg = items.consumableMessages({
			includedUsage: 50,
			price: 1,
		});
		// 120% of the 50-unit allowance = 60 units of overage → total allowed 110.
		const planProd = products.base({
			id: "lr-plan-pct-spend-1",
			items: [consumableMsg],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit_type: "usage_percentage",
						overage_limit: 120,
					},
				],
			},
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "lr-plan-pct-spend-cus-1",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [planProd] }),
			],
			actions: [s.attach({ productId: planProd.id })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		const result = await waitForWebhook<BalancesLimitReachedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === customerId &&
				payload.data?.limit_type === "spend_limit",
			timeoutMs: 15000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;
		expect(data.customer_id).toBe(customerId);
		expect(data.feature_id).toBe(TestFeature.Messages);
		expect(data.limit_type).toBe("spend_limit");
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: plan-level windowed usage_limit reached fires webhook (type usage_limit)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("limit-reached-plan3: plan-level usage_limit fires webhook (usage_limit)")}`,
	async () => {
		// Cap of 5/day on the plan, well under the 1000 included allowance — the
		// windowed usage_limit is the gate. Its live window `usage` only survives if
		// the webhook path evaluates the real fullSubject (not a FullCustomer).
		const planProd = products.base({
			id: "lr-plan-usage-limit-1",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			},
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "lr-plan-usage-limit-cus-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planProd] }),
			],
			actions: [s.attach({ productId: planProd.id })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 6,
		});

		const result = await waitForWebhook<BalancesLimitReachedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === customerId &&
				payload.data?.limit_type === "usage_limit",
			timeoutMs: 15000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;
		expect(data.customer_id).toBe(customerId);
		expect(data.feature_id).toBe(TestFeature.Messages);
		expect(data.limit_type).toBe("usage_limit");
	},
);
