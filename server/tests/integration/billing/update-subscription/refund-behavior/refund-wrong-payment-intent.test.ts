import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

/**
 * Tests that refunds go to the correct payment intent when customer has multiple subscriptions.
 * The refund should target the specific subscription's payment intent, not just the most recent one.
 */

test.skip(`${chalk.yellowBright("refund_payment_method: refunds correct payment intent with multiple products")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemA = items.monthlyPrice({ price: 30 });
	const productA = products.base({
		id: "product-a",
		items: [messagesItem, priceItemA],
	});

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const priceItemB = items.monthlyPrice({ price: 50 });
	const productB = products.base({
		id: "product-b",
		items: [wordsItem, priceItemB],
		isAddOn: true,
	});

	const { customerId, autumnV1, ctx, customer } = await initScenario({
		customerId: "rb-wrong-pi",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productA, productB] }),
		],
		actions: [
			s.attach({ productId: "product-a" }),
			s.attach({ productId: "product-b", newBillingSubscription: true }),
		],
	});

	const stripeCustomerId = customer?.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const paymentIntentsBefore = await stripeCli.paymentIntents.list({
		customer: stripeCustomerId!,
		limit: 10,
	});

	const succeededPIsBefore = paymentIntentsBefore.data.filter(
		(pi) => pi.status === "succeeded",
	);
	expect(succeededPIsBefore.length).toBe(2);

	const [paymentIntentB, paymentIntentA] = succeededPIsBefore;

	expect(paymentIntentB.amount).toBe(5000);
	expect(paymentIntentA.amount).toBe(3000);
	const newPriceItem = items.monthlyPrice({ price: 20 });
	const updateParams = {
		customer_id: customerId,
		product_id: productA.id,
		items: [messagesItem, newPriceItem],
		refund_behavior: "refund_payment_method" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(-10);
	await autumnV1.subscriptions.update(updateParams);

	await new Promise((resolve) => setTimeout(resolve, 1000));

	const refunds = await stripeCli.refunds.list({
		limit: 10,
	});

	const ourRefund = refunds.data.find(
		(r) => r.payment_intent === paymentIntentA.id,
	);
	expect(ourRefund).toBeDefined();

	expect(ourRefund!.payment_intent).toBe(paymentIntentA.id);

	expect(ourRefund!.payment_intent).not.toBe(paymentIntentB.id);
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
	});
});

/**
 * Tests multiple refunds on the same subscription target the correct payment intent.
 *
 * Scenario:
 * 1. Customer subscribes to Product A ($100/month)
 * 2. Customer subscribes to Product B ($30/month add-on)
 * 3. Customer partially downgrades Product A from $100 to $60 → $40 refund
 * 4. Customer downgrades Product A again from $60 to $20 → $40 refund
 *
 * The second refund should still go against PaymentIntent-A, which now has
 * only $60 remaining refundable ($100 - $40 already refunded)
 */
test.skip(`${chalk.yellowBright("refund_payment_method: multiple refunds on same subscription")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const priceItemA = items.monthlyPrice({ price: 100 });
	const productA = products.base({
		id: "product-a",
		items: [messagesItem, priceItemA],
	});

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const priceItemB = items.monthlyPrice({ price: 30 });
	const productB = products.base({
		id: "product-b",
		items: [wordsItem, priceItemB],
		isAddOn: true,
	});

	const { customerId, autumnV1, ctx, customer } = await initScenario({
		customerId: "rb-multi-refund",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productA, productB] }),
		],
		actions: [
			s.attach({ productId: "product-a" }),
			s.attach({ productId: "product-b", newBillingSubscription: true }),
		],
	});

	const stripeCustomerId = customer?.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const paymentIntentsBefore = await stripeCli.paymentIntents.list({
		customer: stripeCustomerId!,
		limit: 10,
	});

	const succeededPIs = paymentIntentsBefore.data.filter(
		(pi) => pi.status === "succeeded",
	);

	const [paymentIntentB, paymentIntentA] = succeededPIs;
	expect(paymentIntentB.amount).toBe(3000);
	expect(paymentIntentA.amount).toBe(10000);
	const priceItem60 = items.monthlyPrice({ price: 60 });
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: productA.id,
		items: [messagesItem, priceItem60],
		refund_behavior: "refund_payment_method" as const,
	});

	await new Promise((resolve) => setTimeout(resolve, 1000));

	const priceItem20 = items.monthlyPrice({ price: 20 });
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: productA.id,
		items: [messagesItem, priceItem20],
		refund_behavior: "refund_payment_method" as const,
	});

	await new Promise((resolve) => setTimeout(resolve, 1000));

	const refunds = await stripeCli.refunds.list({
		payment_intent: paymentIntentA.id,
		limit: 10,
	});

	const ourRefunds = refunds.data.filter((r) => r.amount === 4000);
	expect(ourRefunds.length).toBe(2);

	const refundsB = await stripeCli.refunds.list({
		payment_intent: paymentIntentB.id,
		limit: 10,
	});
	const wrongRefunds = refundsB.data.filter((r) => r.amount === 4000);
	expect(wrongRefunds.length).toBe(0);
});
