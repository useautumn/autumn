/**
 * `customer.threshold_reached` (allowance_used) for tracks decided by the balance worker.
 *
 * Contract:
 *   - The track that takes the included balance below one unit, while overage keeps the feature
 *     usable, sends one allowance_used. Tracks before it and tracks already in overage send none
 *     (the legacy path re-sent it on every overage track).
 *   - When overage later runs out, the refusal sends limit_reached as its own event.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	listThresholdReachedWebhooks,
	NO_WEBHOOK_WAIT_MS,
} from "../utils/expectThresholdReachedWebhook.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["customer.threshold_reached"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

const setupOverageMessages = async ({
	customerId,
	productId,
	maxPurchase,
}: {
	customerId: string;
	productId: string;
	maxPurchase?: number;
}) => {
	const pro = products.pro({
		id: productId,
		items: [items.consumableMessages({ includedUsage: 100, maxPurchase })],
	});
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});
	return (value: number) =>
		autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value,
		});
};

const thresholdTypesOf = async ({ customerId }: { customerId: string }) =>
	(
		await listThresholdReachedWebhooks({
			playToken,
			customerId,
			settleMs: NO_WEBHOOK_WAIT_MS,
		})
	).map((data) => `${data.threshold_type}:${data.feature.id}`);

test.concurrent(
	`${chalk.yellowBright("threshold-allowance1: only the track that runs into overage sends allowance_used")}`,
	async () => {
		const customerId = "threshold-allowance-once";
		const trackMessages = await setupOverageMessages({
			customerId,
			productId: "threshold-allowance-1",
		});

		await trackMessages(60);
		expect(await thresholdTypesOf({ customerId })).toEqual([]);

		await trackMessages(60);
		await trackMessages(10);
		await trackMessages(10);
		expect(await thresholdTypesOf({ customerId })).toEqual([
			`allowance_used:${TestFeature.Messages}`,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-allowance2: emptying the allowance exactly sends allowance_used; exhausting overage then sends limit_reached")}`,
	async () => {
		const customerId = "threshold-allowance-cap";
		const trackMessages = await setupOverageMessages({
			customerId,
			productId: "threshold-allowance-2",
			maxPurchase: 50,
		});

		await trackMessages(100);
		expect(await thresholdTypesOf({ customerId })).toEqual([
			`allowance_used:${TestFeature.Messages}`,
		]);

		await trackMessages(50);
		expect((await thresholdTypesOf({ customerId })).sort()).toEqual([
			`allowance_used:${TestFeature.Messages}`,
			`limit_reached:${TestFeature.Messages}`,
		]);
	},
);
