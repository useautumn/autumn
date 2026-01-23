import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Uncancel Tests (cancel_action: "uncancel")
 *
 * Tests the uncancel functionality which removes a scheduled cancellation
 * from a subscription via the update subscription API.
 *
 * Usage: subscriptions.update({ customer_id, product_id, cancel_action: "uncancel" })
 */

test(`${chalk.yellowBright("uncancel: basic - canceling product → uncancel → active")}`, async () => {
	const customerId = "attach-basic";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
});
