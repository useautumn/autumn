/**
 * Attach Edge Case - Payment method exists but invoice_settings.default_payment_method is null
 *
 * Scenario: Customer has a payment method on file (card attached), but the
 * Stripe customer's invoice_settings.default_payment_method has been cleared.
 * Verifies that billing.attach still succeeds (Stripe can still charge the customer).
 */

import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerProductCorrect } from "../../utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "../../utils/expectStripeSubCorrect";

test.concurrent(`${chalk.yellowBright("pm-edge-case 1: attach succeeds when invoice_settings.default_payment_method is null")}`, async () => {
	const customerId = "attach-pm-edge-null-default";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCustomerId = customer.processor?.id;
	if (!stripeCustomerId) throw new Error("No stripe customer id");

	await ctx.stripeCli.customers.update(stripeCustomerId, {
		invoice_settings: {
			default_payment_method: "" as string,
		},
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerProductCorrect({
		customerId,
		customer: customerAfter,
		productId: pro.id,
		state: "active",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
