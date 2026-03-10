import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Scenario:
 * 1. Customer on premium ($50/mo) with success PM
 * 2. Swap to a failing PM
 * 3. Advance to next billing cycle — invoice fails, subscription goes past_due
 * 4. Attach pro ($20/mo) — downgrade
 * 5. Check: does the Stripe subscription recover to active?
 */
test.concurrent(`${chalk.yellowBright("past-due recovery: attach pro after premium goes past_due")}`, async () => {
	const customerId = "temp-past-due-recovery";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceToNextInvoice(),
			s.attachPaymentMethod({ type: "success" }),
		],
	});

	const stripeCustomerId = customer.processor?.id;
	if (!stripeCustomerId) throw new Error("No stripe customer id");

	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});

	console.log(
		"Subscription status BEFORE attach pro:",
		subsBefore.data.map((sub) => ({
			id: sub.id,
			status: sub.status,
		})),
	);

	expect(subsBefore.data.length).toBeGreaterThan(0);
	expect(subsBefore.data[0].status).toBe("past_due");

	// Downgrade to pro
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	console.log("billing.attach result:", JSON.stringify(attachResult, null, 2));

	// Wait for Stripe to process
	await new Promise((resolve) => setTimeout(resolve, 3000));

	const subsAfter = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});

	console.log(
		"Subscription status AFTER attach pro:",
		subsAfter.data.map((sub) => ({
			id: sub.id,
			status: sub.status,
		})),
	);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	console.log(
		"Customer products after:",
		JSON.stringify(customerAfter.products, null, 2),
	);

	// Check if subscription recovered to active
	const activeSubs = subsAfter.data.filter((sub) => sub.status === "active");
	console.log(`Active subscriptions: ${activeSubs.length}`);

	expect(activeSubs.length).toBeGreaterThan(0);
});
