import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Attach Paid Default Plan Scenario
 *
 * Sets up a customer with a paid default product attached on creation.
 * Paid defaults require a trial with cardRequired: false.
 *
 * Setup:
 * - Paid default product: $20/month with 100 messages, 7-day trial, no card required
 * - Customer with withDefault: true
 */

test(`${chalk.yellowBright("attach-paid-default: customer with paid default product (trial, no card required)")}`, async () => {
	const customerId = "attach-paid-default";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const paidDefault = products.defaultTrial({
		id: "paid-default",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	await initScenario({
		customerId,
		setup: [
			s.products({ list: [paidDefault] }),
			s.customer({ withDefault: true }),
			s.attachPaymentMethod({ type: "success" }),
			s.advanceToNextInvoice(),
		],
		actions: [],
	});
});
