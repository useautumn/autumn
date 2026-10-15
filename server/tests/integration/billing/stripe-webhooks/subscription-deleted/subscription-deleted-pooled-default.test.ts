import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../../pooled-balances/utils/getPooledBalanceDbState";

type BillingUpdatedPayload = {
	type: string;
	data: {
		customer_id: string;
		plan_changes: { action: string; subscription: { plan_id: string } }[];
	};
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: testCtx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("sub.deleted: cancelling a pooled plan to its default finishes the webhook")}`, async () => {
	const customerId = "sub-deleted-pooled-default";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
	});
	const pro = products.pro({
		id: "pro",
		items: [{ ...items.monthlyMessages({ includedUsage: 100 }), pooled: true }],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const beforeCancel = await getPooledBalanceDbState({
		db: ctx.db,
		customerId,
	});
	expect(beforeCancel.contributions).toHaveLength(1);

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	const billingUpdated = await waitForWebhook<BillingUpdatedPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === "billing.updated" &&
			payload.data.customer_id === customerId &&
			payload.data.plan_changes.some(
				(change) =>
					change.action === "expired" && change.subscription.plan_id === pro.id,
			),
		timeoutMs: 30000,
	});
	expect(billingUpdated).not.toBeNull();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		notPresent: [pro.id],
		active: [free.id],
	});

	const afterCancel = await getPooledBalanceDbState({
		db: ctx.db,
		customerId,
	});
	expect(afterCancel.contributions).toHaveLength(0);
	expect(afterCancel.pools).toHaveLength(1);
	expect(afterCancel.pools[0].expires_at).not.toBeNull();
});
