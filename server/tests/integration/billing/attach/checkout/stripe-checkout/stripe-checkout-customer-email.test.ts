import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const parseCheckoutSessionId = (url: string): string | null => {
	const match = url.match(/\/c\/pay\/(cs_[^/?#]+)/);
	return match?.[1] ?? null;
};

test.concurrent(
	`${chalk.yellowBright("stripe-checkout: syncs existing Stripe customer email before checkout")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 10);
		const customerId = `stripe-checkout-email-${suffix}`;
		const email = `${customerId}@example.com`;
		const pro = products.pro({
			id: `pro-checkout-email-${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId }), s.products({ list: [pro] })],
			actions: [],
		});

		const stripeCustomer = await ctx.stripeCli.customers.create({});
		await autumnV1.customers.create({
			id: customerId,
			stripe_id: stripeCustomer.id,
			internalOptions: { disable_defaults: true },
		});

		await autumnV1.post("/customers.get_or_create", {
			customer_id: customerId,
			email,
		});
		await autumnV1.customers.updateRpc(customerId, { email });

		const result = await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: pro.id,
			},
			{ timeout: 0 },
		);
		expect(result.payment_url).toContain("checkout.stripe.com");

		const checkoutSessionId = parseCheckoutSessionId(result.payment_url);
		expect(checkoutSessionId).toBeTruthy();

		const checkoutSession = await ctx.stripeCli.checkout.sessions.retrieve(
			checkoutSessionId!,
		);
		expect(checkoutSession.customer).toBe(stripeCustomer.id);

		const updatedStripeCustomer = await ctx.stripeCli.customers.retrieve(
			stripeCustomer.id,
		);
		expect(updatedStripeCustomer.deleted).toBeFalsy();
		if (updatedStripeCustomer.deleted) return;
		expect(updatedStripeCustomer.email).toBe(email);
	},
);
