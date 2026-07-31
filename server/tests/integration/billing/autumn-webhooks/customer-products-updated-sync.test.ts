/** Red: billing.sync_v2 attaches the plan but omits customer.products.updated.
 * Green: sync emits the webhook with the attached active plan. */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiProduct, SyncParamsV1 } from "@autumn/shared";
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

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
	};
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["customer.products.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(`${chalk.yellowBright("customer.products.updated: sync emits webhook for attached plan")}`, async () => {
	const customerId = "customer-products-updated-sync";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", skipWebhooks: true }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: subscriptionId,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: pro.id, expire_previous: true }],
			},
		],
	} satisfies SyncParamsV1);

	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: webhook.playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			payload.data?.scenario === "cancel",
		timeoutMs: 15000,
	});

	expect(result).not.toBeNull();
	expect(result?.payload.data.updated_product.id).toBe(pro.id);
	expect(
		result?.payload.data.customer.products.find(
			(product) => product.id === pro.id,
		)?.status,
	).toBe("active");
});
