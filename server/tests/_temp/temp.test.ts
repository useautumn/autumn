import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("temp: legacy checkout annual base + adjustable monthly prepaid")}`, async () => {
	const customerId = "temp-legacy-checkout-annual-adjustable-prepaid";
	const includedCallMinutes = 100;
	const checkoutQuantityInUnits = 300;

	const monthlyPrepaidCallMinutes = items.prepaid({
		featureId: TestFeature.Messages,
		includedUsage: includedCallMinutes,
		billingUnits: 100,
		price: 13,
	});

	const smallBusiness = products.proAnnual({
		id: "small-business",
		items: [monthlyPrepaidCallMinutes],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [smallBusiness] }),
		],
		actions: [],
	});

	const result = await autumnV1.attach({
		customer_id: customerId,
		product_id: smallBusiness.id,
		// options: [
		// 	{
		// 		feature_id: TestFeature.Messages,
		// 		adjustable: true,
		// 	},
		// ],
	});

	expect(result.checkout_url).toBeDefined();
	expect(result.checkout_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({
		url: result.checkout_url,
		// overrideQuantity: checkoutQuantityInUnits / 100,
	});

	await timeout(12000);
});
