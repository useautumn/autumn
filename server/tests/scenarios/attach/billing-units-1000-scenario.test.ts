import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Billing Units 1000 Scenario
 *
 * Sets up a pro product ($20/mo) with prepaid messages at 1000 billing units,
 * and a customer with a payment method ready for attachment.
 */

test(`${chalk.yellowBright("billing-units-1000: product with 1000 billing units + customer")}`, async () => {
	const customerId = "billing-units-1000";

	const prepaidMessagesItem = items.prepaidMessages({
		billingUnits: 1000,
		price: 10,
	});

	const pro = products.pro({ items: [prepaidMessagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
});
