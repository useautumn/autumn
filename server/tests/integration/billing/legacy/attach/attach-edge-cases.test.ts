import { expect, test } from "bun:test";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckout";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { removeAllPaymentMethods } from "@/external/stripe/customers/paymentMethods/operations/removeAllPaymentMethods.js";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer.js";

test.concurrent(`${chalk.yellowBright("attach: alipay payment method returns checkout_url")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "alipay-attach-1",
		setup: [
			s.customer({ withDefault: false, paymentMethod: "alipay" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach pro with alipay - should return checkout_url since alipay requires redirect
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(res.checkout_url).toBeDefined();
	expect(res.checkout_url).toContain("checkout.stripe.com");
});

test.concurrent(`${chalk.yellowBright("attach: pro then upgrade to premium with alipay")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Premium is an addon (different group) so both can be active
	const premium = products.base({
		id: "premium",
		items: [messagesItem, items.monthlyPrice({ price: 50 })],
	});

	const { customerId, autumnV1, ctx, customer } = await initScenario({
		customerId: "alipay-upgrade",
		setup: [
			s.customer({ withDefault: false, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	// Attach pro with card payment method
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify pro is attached
	const customerAfterPro = await autumnV1.customers.get(customerId);
	expectProductAttached({
		customer: customerAfterPro,
		product: pro,
	});

	// Remove all payment methods and attach alipay
	const stripeCustomerId = customer.processor?.id;
	if (!stripeCustomerId) throw new Error("No stripe customer id");

	await removeAllPaymentMethods({
		stripeClient: ctx.stripeCli,
		stripeCustomerId,
	});

	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId: stripeCustomerId,
		type: "alipay",
	});

	// Add premium with alipay - should return checkout_url
	const premiumRes = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	// If checkout_url is returned, complete the invoice confirmation
	if (premiumRes.checkout_url) {
		await completeInvoiceCheckout({
			url: premiumRes.checkout_url,
		});
	}

	// Verify both pro and premium are attached
	const customerAfterAddon = await autumnV1.customers.get(customerId);

	expectProductAttached({
		customer: customerAfterAddon,
		product: premium,
	});
});
