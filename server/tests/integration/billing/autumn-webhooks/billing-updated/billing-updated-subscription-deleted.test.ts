/**
 * Integration test: `billing.updated` webhook fires when a Stripe
 * subscription is canceled (subscription.deleted webhook).
 *
 * Setup: attach a paid plan, cancel the Stripe subscription directly. Our
 * `handleStripeSubscriptionDeleted` handler expires the customer product and
 * `emitBillingChangeWebhook` fires the webhook with an `expired` change.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type BillingUpdatedPayload = {
	type: string;
	data: BillingChangeResponse & { tags?: string[] };
};

const findChange = (
	plan_changes: CustomerPlanChange[] | undefined,
	{ action, planId }: { action: PlanChangeAction; planId: string },
): CustomerPlanChange | undefined =>
	plan_changes?.find(
		(change) =>
			change.action === action &&
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId,
	);

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["billing.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(
	`${chalk.yellowBright("billing.updated: stripe subscription.deleted → expired change")}`,
	async () => {
		const customerId = "billing-updated-sub-deleted";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const { ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const subscriptionId = await getSubscriptionId({
			ctx: scenarioCtx,
			customerId,
			productId: pro.id,
		});

		await scenarioCtx.stripeCli.subscriptions.cancel(subscriptionId);

		const result = await waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data?.plan_changes, {
					action: "expired",
					planId: pro.id,
				}) !== undefined,
			timeoutMs: 30000,
		});

		expect(result).not.toBeNull();
		const expired = findChange(result!.payload.data.plan_changes, {
			action: "expired",
			planId: pro.id,
		});
		expect(expired).toBeDefined();
	},
);

// When a customer "cancels to free" (downgrades a paid plan to a free
// default), Autumn schedules pro for expiry at period_end and free to start
// at the same moment. At period_end, Stripe cancels pro's subscription →
// `handleStripeSubscriptionDeleted` activates free and emits the webhook
// with pro expired + free activated.
test(
	`${chalk.yellowBright("billing.updated: pro → free at period end → expired pro + activated free (via subscription.deleted)")}`,
	async () => {
		const customerId = "billing-updated-cancel-to-free";
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", skipWebhooks: true }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: free.id }), // schedules cancel to free
				s.advanceTestClock({ toNextInvoice: true }),
			],
		});

		const result = await waitForWebhook<BillingUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "billing.updated" &&
				payload.data?.customer_id === customerId &&
				findChange(payload.data?.plan_changes, {
					action: "expired",
					planId: pro.id,
				}) !== undefined &&
				findChange(payload.data?.plan_changes, {
					action: "activated",
					planId: free.id,
				}) !== undefined,
			timeoutMs: 30000,
		});

		expect(result).not.toBeNull();
		const { data } = result!.payload;

		const expired = findChange(data.plan_changes, {
			action: "expired",
			planId: pro.id,
		});
		expect(expired?.subscription?.status).toBe("expired");

		const activated = findChange(data.plan_changes, {
			action: "activated",
			planId: free.id,
		});
		expect(activated?.subscription?.status).toBe("active");
	},
);
