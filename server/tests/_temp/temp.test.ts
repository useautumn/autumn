import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { removeAllPaymentMethods } from "@/external/stripe/customers/paymentMethods/operations/removeAllPaymentMethods";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

test.concurrent(`${chalk.yellowBright("temp: attach free default, attach pro annual, cancel immediately")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premium = products.base({
		id: "premium",
		items: [items.monthlyPrice({ price: 50 }), messagesItem],
	});

	const { customerId, autumnV1, ctx, customer } = await initScenario({
		customerId: "temp-free-pro-annual-cancel",
		setup: [
			s.customer({ withDefault: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	// Now try to attach pro annual (this should trigger the Alipay handling code)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	await removeAllPaymentMethods({
		stripeClient: ctx.stripeCli,
		stripeCustomerId: customer.processor?.id,
	});

	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId: customer.processor?.id,
		type: "alipay",
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	console.log("Res:", res);

	// // Verify pro annual is active
	// const customerAfterAttach = await autumnV1.customers.get(customerId);
	// console.log("Customer after attach:", JSON.stringify(customerAfterAttach.products, null, 2));

	// // Cancel pro annual immediately
	// await autumnV1.subscriptions.update({
	// 	customer_id: customerId,
	// 	product_id: proAnnual.id,
	// 	cancel_action: "cancel_immediately",
	// });

	// // Verify state after cancel
	// const customerAfterCancel = await autumnV1.customers.get(customerId);
	// console.log("Customer after cancel:", JSON.stringify(customerAfterCancel.products, null, 2));
});
