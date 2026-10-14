import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("autumn-checkout: payment failure - no payment method")}`, async () => {
	const customerId = "checkout-no-payment-method";

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
		actions: [s.billing.attach({ productId: pro.id }), s.removePaymentMethod()],
	});

	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "always",
	});
	console.log("no payment method checkout result:", attachResult);
});
