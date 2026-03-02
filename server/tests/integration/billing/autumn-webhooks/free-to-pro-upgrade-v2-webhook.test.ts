/**
 * Integration test: Free → Pro upgrade via Stripe Checkout session,
 * verifying the customer.products.updated webhook fires with the
 * correct scenario values.
 *
 * Does NOT use a pre-attached payment method. Instead, the upgrade
 * goes through the full Stripe Checkout flow via completeStripeCheckoutFormV2.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiProduct } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	generatePlayToken,
	getPlayWebhookUrl,
	waitForWebhook,
} from "./utils/svixPlayClient.js";
import {
	createTestEndpoint,
	deleteTestEndpoint,
} from "./utils/svixTestEndpoint.js";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVIX PLAY SETUP
// ═══════════════════════════════════════════════════════════════════════════════

let playToken: string;
let endpointId: string;

beforeAll(async () => {
	playToken = await generatePlayToken();
	console.log(`Generated Svix Play token: ${playToken}`);

	const svixAppId = ctx.org.svix_config?.sandbox_app_id;
	if (!svixAppId) {
		throw new Error(
			"Test org does not have svix_config.sandbox_app_id configured. " +
				"Cannot run webhook integration tests without Svix app.",
		);
	}

	const playUrl = getPlayWebhookUrl(playToken);
	console.log(`Creating Svix endpoint: ${playUrl}`);
	endpointId = await createTestEndpoint({ appId: svixAppId, playUrl });
	console.log(`Created Svix endpoint: ${endpointId}`);
});

afterAll(async () => {
	const svixAppId = ctx.org.svix_config?.sandbox_app_id;
	if (svixAppId && endpointId) {
		await deleteTestEndpoint({ appId: svixAppId, endpointId });
		console.log(`Deleted Svix endpoint: ${endpointId}`);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Free (default) → Pro via Stripe Checkout
// ═══════════════════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("webhook checkout: free default → pro upgrade via stripe checkout - scenario: new")}`,
	async () => {
		const customerId = "webhook-checkout-free-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		// Setup: customer with NO payment method and a free default product
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, skipWebhooks: true }), // no payment method
				s.products({ list: [free, pro] }),
			],
			actions: [],
		});

		// Step 1: Attach free default product (no checkout needed, it's free)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		// Wait for the "new" webhook for the free product attachment
		const freeWebhook = await waitForWebhook<CustomerProductsUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "customer.products.updated" &&
				payload.data?.customer?.id === customerId &&
				payload.data?.scenario === "new" &&
				payload.data?.updated_product?.id === free.id,
			timeoutMs: 15000,
		});

		expect(freeWebhook).not.toBeNull();
		expect(freeWebhook?.payload.data.scenario).toBe("new");
		expect(freeWebhook?.payload.data.updated_product.id).toBe(free.id);

		// Verify free is active
		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: free.id });

		// Step 2: Attempt upgrade to Pro — no payment method, so returns payment_url
		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(upgradeResult.payment_url).toBeDefined();
		console.log(`Checkout URL: ${upgradeResult.payment_url}`);

		// Step 3: Complete the Stripe Checkout form via browser automation
		await completeStripeCheckoutFormV2({ url: upgradeResult.payment_url });

		// Wait for Stripe webhook to be processed by the server
		await timeout(12000);

		// Step 4: Assert upgrade webhook received with scenario "new"
		// (free → pro upgrade goes through checkout session completed path)
		const upgradeWebhook = await waitForWebhook<CustomerProductsUpdatedPayload>(
			{
				token: playToken,
				predicate: (payload) =>
					payload.type === "customer.products.updated" &&
					payload.data?.customer?.id === customerId &&
					payload.data?.updated_product?.id === pro.id,
				timeoutMs: 20000,
			},
		);

		expect(upgradeWebhook).not.toBeNull();
		expect(upgradeWebhook?.payload.type).toBe("customer.products.updated");

		const { data } = upgradeWebhook!.payload;
		console.log(`Upgrade webhook scenario: ${data.scenario}`);
		expect(data.updated_product.id).toBe(pro.id);
		expect(data.customer.id).toBe(customerId);

		// Step 5: Verify Pro is now active
		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
	},
	{ timeout: 120000 },
);
