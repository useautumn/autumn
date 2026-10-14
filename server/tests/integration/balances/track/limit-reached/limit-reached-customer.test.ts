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
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";

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

test.concurrent(`${chalk.yellowBright("limit-reached-cus1: included allowance exhausted fires webhook")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "lr-included-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "lr-included-cus-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.limit_type === "included",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.type).toBe("balances.limit_reached");

	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.limit_type).toBe("included");
	expect(data.entity_id).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("limit-reached-cus2: max_purchase cap reached fires webhook")}`, async () => {
	const consumableMsg = items.consumableMessages({
		includedUsage: 50,
		maxPurchase: 50,
	});
	const proProd = products.pro({
		id: "lr-max-purchase-1",
		items: [consumableMsg],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "lr-maxpurchase-cus-1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId &&
			payload.data?.limit_type === "max_purchase",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.limit_type).toBe("max_purchase");
});

test.concurrent(`${chalk.yellowBright("limit-reached-cus3: spend_limit reached fires webhook")}`, async () => {
	const consumableMsg = items.consumableMessages({
		includedUsage: 50,
		price: 1,
	});
	const proProd = products.pro({
		id: "lr-spend-limit-1",
		items: [consumableMsg],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "lr-spendlimit-cus-1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		overageLimit: 10,
	});

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
});

test.concurrent(`${chalk.yellowBright("limit-reached-cus4: usage below limit does not fire webhook")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "lr-no-fire-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "lr-nofire-cus-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId,
		timeoutMs: 8000,
	});

	expect(result).toBeNull();
});

test.concurrent(`${chalk.yellowBright("limit-reached-cus5: does not refire after limit already reached")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "lr-no-refire-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "lr-norefire-cus-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const firstResult = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId,
		timeoutMs: 15000,
	});

	expect(firstResult).not.toBeNull();

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId,
		timeoutMs: 8000,
	});

	let matchCount = 0;
	const history = await getPlayHistory({ token: playToken });
	for (const event of history.data) {
		try {
			const payload = parseEventBody<BalancesLimitReachedPayload>(event);
			if (
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === customerId
			) {
				matchCount++;
			}
		} catch {
		}
	}

	expect(matchCount).toBe(1);
});

test.concurrent(`${chalk.yellowBright("limit-reached-cus6: precision — 0.001 remaining does not trigger, 0 remaining does")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1 });
	const freeProd = products.base({
		id: "lr-precision-1",
		items: [messagesItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "lr-precision-cus-1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 0.999,
	});

	const noFireResult = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId,
		timeoutMs: 8000,
	});

	expect(noFireResult).toBeNull();

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 0.001,
	});

	const result = await waitForWebhook<BalancesLimitReachedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "balances.limit_reached" &&
			payload.data?.customer_id === customerId,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;
	expect(data.customer_id).toBe(customerId);
	expect(data.feature_id).toBe(TestFeature.Messages);
	expect(data.limit_type).toBe("included");
});
