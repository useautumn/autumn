import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test(`${chalk.yellowBright("check where default payment method lives after attach")}`, async () => {
	const customerId = "pm-location-check";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-pm-check",
		items: [messagesItem],
	});

	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId!,
		status: "all",
	});

	const subscription = subs.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subscription).toBeDefined();

	const subDefaultPm = subscription!.default_payment_method;
	console.log(`Subscription default_payment_method: ${JSON.stringify(subDefaultPm)}`);

	const stripeCustomer = await ctx.stripeCli.customers.retrieve(stripeCustomerId!);
	const customerDefaultPm = "deleted" in stripeCustomer
		? null
		: stripeCustomer.invoice_settings?.default_payment_method;
	console.log(`Customer invoice_settings.default_payment_method: ${JSON.stringify(customerDefaultPm)}`);

	const customerDefaultSource = "deleted" in stripeCustomer
		? null
		: stripeCustomer.default_source;
	console.log(`Customer default_source: ${JSON.stringify(customerDefaultSource)}`);

	if (subDefaultPm) {
		console.log(chalk.green("Payment method is set at the SUBSCRIPTION level"));
	} else if (customerDefaultPm) {
		console.log(chalk.green("Payment method is set at the CUSTOMER level (invoice_settings)"));
	} else if (customerDefaultSource) {
		console.log(chalk.green("Payment method is set at the CUSTOMER level (default_source)"));
	} else {
		console.log(chalk.red("No default payment method found on subscription or customer"));
	}
});
