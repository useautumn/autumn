import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("temp: attach free default, attach pro annual, cancel immediately")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "temp-free-pro-annual-cancel",
		setup: [
			s.customer({ paymentMethod: "success", withDefault: true }),
			s.products({ list: [free, proAnnual] }),
		],
		actions: [
			// Attach pro annual (free default already attached via withDefault: true)
			s.attach({ productId: proAnnual.id }),
		],
	});

	// Verify pro annual is active
	const customerAfterAttach = await autumnV1.customers.get(customerId);
	console.log("Customer after attach:", JSON.stringify(customerAfterAttach.products, null, 2));

	// Cancel pro annual immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proAnnual.id,
		cancel_action: "cancel_immediately",
	});

	// Verify state after cancel
	const customerAfterCancel = await autumnV1.customers.get(customerId);
	console.log("Customer after cancel:", JSON.stringify(customerAfterCancel.products, null, 2));
});
