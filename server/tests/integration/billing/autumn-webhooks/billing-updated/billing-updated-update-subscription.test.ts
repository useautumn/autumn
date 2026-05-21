/**
 * Integration test for `billing.updated` webhook via update-subscription endpoint.
 *
 * Contract under test:
 *   Event type: billing.updated
 *   Scenario U1: update product items (increase included usage) → one `updated` for pro
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	BillingChangeResponse,
	CustomerPlanChange,
	PlanChangeAction,
} from "@autumn/shared";
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
	data: BillingChangeResponse;
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

test.concurrent(`${chalk.yellowBright("billing.updated: U1 update items → updated")}`, async () => {
	const customerId = "billing-updated-u1-update-items";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, priceItem],
	});

	const result = await waitForWebhook<BillingUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data?.customer_id === customerId &&
			findChange(payload.data.plan_changes, {
				action: "updated",
				planId: pro.id,
			}) !== undefined,
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	const { data } = result!.payload;

	const updated = findChange(data.plan_changes, {
		action: "updated",
		planId: pro.id,
	});
	expect(updated).toBeDefined();
	expect(updated?.subscription?.plan_id).toBe(pro.id);
});
