import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Past Due Scenario
 *
 * Sets up a customer whose renewal was declined, leaving the Stripe
 * subscription past_due. The initial charge has to succeed, so the card is
 * swapped for a failing one before the clock advances.
 *
 * Setup:
 * - Pro product: $20/month with 100 messages
 * - Customer attached with a working card, then moved onto pm_card_chargeCustomerFail
 * - Clock advanced one cycle so the renewal invoice fails
 */

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
