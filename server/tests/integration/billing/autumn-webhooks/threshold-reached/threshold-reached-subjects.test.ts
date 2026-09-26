/**
 * `customer.threshold_reached` (limit_reached) on the worker path, beyond a plain customer feature.
 *
 * Contract:
 *   - An entity track that exhausts the entity's own allowance sends one event, carrying the
 *     customer (not the entity) as the payload's customer.
 *   - A track funded by a credit system that exhausts the credits names the credit system as
 *     the feature, as `balances.limit_reached` does.
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
	waitForThresholdReachedWebhook,
} from "../utils/expectThresholdReachedWebhook.js";

/** action1 costs 0.2 credits (tests/setup/v2Features.ts), so 500 of them spend 100. */
const ACTION1_UNITS_FOR_100_CREDITS = 500;

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

test.concurrent(
	`${chalk.yellowBright("threshold-subject1: entity track that exhausts the entity's allowance sends one event for the customer")}`,
	async () => {
		const perEntity = products.base({
			id: "threshold-entity",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const { customerId, autumnV1, entities } = await initScenario({
			customerId: "threshold-entity",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntity] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: perEntity.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		const data = await waitForThresholdReachedWebhook({
			playToken,
			customerId,
		});
		expect(data?.threshold_type).toBe("limit_reached");
		expect(data?.feature.id).toBe(TestFeature.Messages);
		expect(data?.customer.id).toBe(customerId);

		const sent = await listThresholdReachedWebhooks({ playToken, customerId });
		expect(sent).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-subject2: a credit-funded track that exhausts the credits names the credit system")}`,
	async () => {
		const credits = products.base({
			id: "threshold-credits",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});
		const { customerId, autumnV1 } = await initScenario({
			customerId: "threshold-credits",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [credits] }),
			],
			actions: [s.attach({ productId: credits.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: ACTION1_UNITS_FOR_100_CREDITS,
		});

		const data = await waitForThresholdReachedWebhook({
			playToken,
			customerId,
		});
		expect(data?.threshold_type).toBe("limit_reached");
		expect(data?.feature.id).toBe(TestFeature.Credits);

		const sent = await listThresholdReachedWebhooks({ playToken, customerId });
		expect(sent).toHaveLength(1);
	},
);
