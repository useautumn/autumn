import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-checkout zero base price: $0 annual base with one-off prepaid checks out")}`,
	async () => {
		const customerId = "legacy-checkout-zero-base-price";

		const proAnnual = products.base({
			id: "pro-annual-zero-base",
			items: [items.annualPrice({ price: 0 }), items.oneOffMessages()],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [proAnnual] }),
			],
			actions: [],
		});

		const checkoutRes = await autumnV1.checkout({
			customer_id: customerId,
			product_id: proAnnual.id,
		});

		const checkoutUrl = checkoutRes.url ?? "";
		expect(checkoutUrl).toContain("checkout.stripe.com");

		await completeStripeCheckoutFormV2({ url: checkoutUrl });
		await timeout(10000);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: proAnnual.id });
	},
);
