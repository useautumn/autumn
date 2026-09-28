/**
 * `customer.threshold_reached` (limit_reached) for tracks decided by the balance worker.
 *
 * Contract:
 *   - Callers below API 2.1 get one event when a track takes the feature from allowed to refused:
 *     threshold_type "limit_reached", the feature, and the whole customer at the caller's version,
 *     without autumn_id or invoices.
 *   - Callers on 2.1+ get none, though the same crossing sends `balances.limit_reached`.
 *   - Tracks that stay under the limit, and tracks refused after it, send nothing.
 *
 * Red (before): the worker path never sent the event.
 * Green (after): the server sends it from the track reply's effects.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
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
import {
	listThresholdReachedWebhooks,
	NO_WEBHOOK_WAIT_MS,
	waitForThresholdReachedWebhook,
} from "../utils/expectThresholdReachedWebhook.js";

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["customer.threshold_reached", "balances.limit_reached"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

const freeMessages = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

test.concurrent(
	`${chalk.yellowBright("threshold-limit1: API 1.2 track that exhausts the allowance sends one limit_reached with the whole customer")}`,
	async () => {
		const free = freeMessages({ id: "threshold-limit-1" });
		const { customerId, autumnV1 } = await initScenario({
			customerId: "threshold-limit-v12",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.attach({ productId: free.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		const data = await waitForThresholdReachedWebhook({
			playToken,
			customerId,
		});
		expect(data).not.toBeNull();
		expect(data?.threshold_type).toBe("limit_reached");
		expect(data?.feature.id).toBe(TestFeature.Messages);
		// Rendered at 1.2: the `features` map, as the customer looked after the track.
		expect(data?.customer.features?.[TestFeature.Messages]?.balance).toBe(0);
		expect(data?.customer.autumn_id).toBeUndefined();
		expect(data?.customer.invoices).toBeUndefined();

		const sent = await listThresholdReachedWebhooks({ playToken, customerId });
		expect(sent).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-limit2: API 2.0 still receives it; API 2.1 gets balances.limit_reached only")}`,
	async () => {
		const free = freeMessages({ id: "threshold-limit-2" });
		const v21CustomerId = "threshold-limit-v21";
		const { customerId, autumnV2, autumnV2_1 } = await initScenario({
			customerId: "threshold-limit-v20",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [free] }),
				s.otherCustomers([{ id: v21CustomerId }]),
			],
			actions: [
				s.attach({ productId: free.id }),
				s.attach({ productId: free.id, customerId: v21CustomerId }),
			],
		});

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await autumnV2_1.track({
			customer_id: v21CustomerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		const v20 = await waitForThresholdReachedWebhook({ playToken, customerId });
		expect(v20?.threshold_type).toBe("limit_reached");

		// The 2.1 customer did cross: its balances.limit_reached proves it.
		const limitReached = await waitForWebhook<{
			type: string;
			data: { customer_id: string };
		}>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "balances.limit_reached" &&
				payload.data?.customer_id === v21CustomerId,
			timeoutMs: 15_000,
		});
		expect(limitReached).not.toBeNull();
		const v21Sent = await listThresholdReachedWebhooks({
			playToken,
			customerId: v21CustomerId,
			settleMs: NO_WEBHOOK_WAIT_MS,
		});
		expect(v21Sent).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-limit3: under the limit sends nothing, the crossing sends one, refused tracks after it send nothing")}`,
	async () => {
		const free = freeMessages({ id: "threshold-limit-3" });
		const { customerId, autumnV1 } = await initScenario({
			customerId: "threshold-limit-once",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.attach({ productId: free.id })],
		});
		const trackMessages = (value: number) =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value,
			});

		await trackMessages(60);
		const underLimit = await listThresholdReachedWebhooks({
			playToken,
			customerId,
			settleMs: NO_WEBHOOK_WAIT_MS,
		});
		expect(underLimit).toHaveLength(0);

		await trackMessages(40);
		expect(
			await waitForThresholdReachedWebhook({ playToken, customerId }),
		).not.toBeNull();

		await trackMessages(10).catch(() => undefined);
		await trackMessages(10).catch(() => undefined);
		const sent = await listThresholdReachedWebhooks({
			playToken,
			customerId,
			settleMs: NO_WEBHOOK_WAIT_MS,
		});
		expect(sent).toHaveLength(1);
	},
);
