import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * 3DS Required Checkout Scenario
 *
 * Generates an Autumn Checkout URL for a paid product where invoice payment
 * will require additional authentication when the checkout is confirmed.
 */

test(`${chalk.yellowBright("autumn-checkout: payment failure - 3ds required")}`, async () => {
	const customerId = "checkout-3ds-required";

	const pro = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "always",
	});
	console.log("3ds required checkout result:", attachResult);

	// const checkoutUrl = attachResult.checkout_url;
	// expect(checkoutUrl).toBeDefined();
	// expect(checkoutUrl).toContain("/c/");

	// const checkoutId = checkoutUrl!.split("/c/")[1];
	// console.log("3ds required checkout ID:", checkoutId);
	// console.log("open checkout URL and confirm to reproduce 3ds_required");
});
