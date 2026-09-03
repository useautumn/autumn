/**
 * TDD test for the `usage_limit` block on `balances.limit_reached`.
 *
 * Contract under test:
 *   New types/fields:
 *     - limit_reached.filter (schema catch-up; already emitted for filtered caps)
 *     - limit_reached.usage_limit { limit, interval, anchor, usage, remaining, window_start_at, window_end_at }
 *       present iff limit_type is usage_limit; absent for included / spend_limit / max_purchase
 *
 * Pre-impl red: payload has no usage_limit block.
 * Post-impl green: checkLimitReached reads the resolved window limit off the FullSubject.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ApiVersion, ms, ResetInterval } from "@autumn/shared";
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
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expectUsageLimitWindowContains } from "../../utils/usage-limit-utils/expectUsageLimitWindowContains.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

type LimitReachedPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		limit_type: string;
		entity_id?: string;
		filter?: { properties: Record<string, string> };
		usage_limit?: {
			limit: number;
			interval: string;
			anchor: string;
			usage: number;
			remaining: number;
			window_start_at: number;
			window_end_at: number;
		};
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

const waitForLimitReached = ({
	customerId,
	limitType,
}: {
	customerId: string;
	limitType: string;
}) =>
	waitForWebhook<LimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.limit_type === limitType,
		timeoutMs: 15000,
	});

test(`${chalk.yellowBright("limit-reached-ul1: a usage_limit block describes the cap that blocked")}`, async () => {
	const customerId = "lr-ul-block-1";
	const plan = products.base({
		id: "lr-ul-block",
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit: 5,
		interval: ResetInterval.Day,
		anchor: "utc",
	});

	const trackedAt = Date.now();
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});

	const result = await waitForLimitReached({
		customerId,
		limitType: "usage_limit",
	});
	expect(result).not.toBeNull();
	expect(result!.payload.data.filter).toBeUndefined();
	expect(result!.payload.data.usage_limit).toMatchObject({
		limit: 5,
		interval: "day",
		anchor: "utc",
		usage: 5,
		remaining: 0,
	});
	expectUsageLimitWindowContains({
		usageLimit: result!.payload.data.usage_limit,
		at: trackedAt,
		intervalMs: ms.days(1),
	});
});

test(`${chalk.yellowBright("limit-reached-ul2: a filtered cap echoes its filter and filtered counter")}`, async () => {
	const customerId = "lr-ul-filter-1";
	const plan = products.base({
		id: "lr-ul-filter",
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await timeout(2000);
	await autumnV2_3.customers.update(customerId, {
		billing_controls: {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Day,
					anchor: "utc",
					filter: { properties: { apiKeyId: "key-a" } },
				},
			],
		},
	});
	await timeout(3000);

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
		properties: { apiKeyId: "key-a" },
	});

	const result = await waitForLimitReached({
		customerId,
		limitType: "usage_limit",
	});
	expect(result).not.toBeNull();
	expect(result!.payload.data.filter).toEqual({
		properties: { apiKeyId: "key-a" },
	});
	expect(result!.payload.data.usage_limit?.limit).toBe(5);
	expect(result!.payload.data.usage_limit?.usage).toBe(5);
	expect(result!.payload.data.usage_limit?.remaining).toBe(0);
});

test(`${chalk.yellowBright("limit-reached-ul3: an included-allowance block carries no usage_limit")}`, async () => {
	const customerId = "lr-ul-included-1";
	const plan = products.base({
		id: "lr-ul-included",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const result = await waitForLimitReached({
		customerId,
		limitType: "included",
	});
	expect(result).not.toBeNull();
	expect(result!.payload.data.usage_limit).toBeUndefined();
});
