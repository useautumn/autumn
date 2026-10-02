/**
 * A plan change that shrinks shared credits sends ONE billing.updated, tagged allocations_adjusted (PRD §11).
 *
 * Red (before):  two events: the plan's, then a second one carrying only the tag.
 * Green (after): the plan's own event carries the tag; no second event.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "../../utils/svixWebhookTestUtils.js";
import {
	latestPlayIterator,
	playEventsSince,
} from "./utils/playEventsSince.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "allocate-webhook-1";

type BillingUpdatedPayload = {
	type: string;
	data: { customer_id: string; tags: string[] };
};

const isCustomerBillingUpdated = (payload: BillingUpdatedPayload) =>
	payload.type === "billing.updated" && payload.data.customer_id === customerId;

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("allocate-webhook1: a shrinking plan change sends one billing.updated tagged allocations_adjusted")}`, async () => {
	const base = products.base({
		id: `${customerId}-base`,
		items: [items.monthlyMessages({ includedUsage: 6000 })],
	});
	const addOn = products.base({
		id: `${customerId}-addon`,
		isAddOn: true,
		items: [items.monthlyMessages({ includedUsage: 4000 })],
	});
	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [base, addOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.billing.attach({ productId: addOn.id }),
		],
	});
	const [a, b] = entities.map((entity) => entity.id);
	await autumnV2_3.customers.update(customerId, {
		billing_controls: {
			balance_allocations: [
				{
					feature_id: TestFeature.Messages,
					interval: ResetInterval.Month,
					allocations: [
						{ entity_id: a, amount: 5000 },
						{ entity_id: b, amount: 5000 },
					],
				},
			],
		},
	});

	// allocate's own tagged billing.updated is fire-and-forget: let it land before the baseline.
	const allocateEvent = await waitForWebhook<BillingUpdatedPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			isCustomerBillingUpdated(payload) &&
			payload.data.tags.includes("allocations_adjusted"),
		timeoutMs: 20000,
	});
	expect(allocateEvent).not.toBeNull();
	const baseline = await latestPlayIterator({ token: webhook.playToken });
	await autumnV2_3.customers.update(customerId, {
		billing_controls: {
			balance_allocations: [
				{
					feature_id: TestFeature.Messages,
					interval: ResetInterval.Month,
					allocations: [
						{ entity_id: a, amount: 5000 },
						{ entity_id: b, amount: 5000 },
					],
				},
			],
		},
	});
	await timeout(5000);
	expect(
		(
			await playEventsSince<BillingUpdatedPayload>({
				token: webhook.playToken,
				iterator: baseline,
			})
		).filter(isCustomerBillingUpdated),
	).toEqual([]);

	await autumnV2_3.subscriptions.update({
		customer_id: customerId,
		plan_id: addOn.id,
		cancel_action: "cancel_immediately",
	});

	const customerEventsSinceCancel = async () =>
		(
			await playEventsSince<BillingUpdatedPayload>({
				token: webhook.playToken,
				iterator: baseline,
			})
		).filter(isCustomerBillingUpdated);
	await pollUntilAsserted({
		fetch: customerEventsSinceCancel,
		assert: (events) => expect(events.length).toBeGreaterThan(0),
	});

	// Give a stray second event time to arrive before counting.
	await timeout(5000);
	const events = await customerEventsSinceCancel();
	expect(events).toHaveLength(1);
	expect(events[0].data.tags).toContain("allocations_adjusted");
});
