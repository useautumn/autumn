import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ApiCustomerV3, ApiProduct } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
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
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["customer.products.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(
	`${chalk.yellowBright("webhook v1 checkout: free default → pro upgrade via stripe checkout - scenario: new")}`,
	async () => {
		const customerId = "webhook-v1-checkout-free-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, skipWebhooks: true }),
				s.products({ list: [free, pro] }),
			],
			actions: [],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

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

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: free.id });

		const upgradeResult = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(upgradeResult.checkout_url).toBeDefined();
		console.log(`Checkout URL: ${upgradeResult.checkout_url}`);

		await completeStripeCheckoutFormV2({ url: upgradeResult.checkout_url });

		await timeout(12000);

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

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
	},
	{ timeout: 120000 },
);
