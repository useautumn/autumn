import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("past-due: customer with a declined renewal")}`, async () => {
	const customerId = "past-due";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceToNextInvoice(),
		],
	});
});
