import { expect, test } from "bun:test";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { isAutumnCheckoutSubscription } from "@/internal/billing/v2/actions/sync/utils/isAutumnCheckoutSubscription";
import { CusService } from "@/internal/customers/CusService";

const getLatestStripeSubscription = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<Stripe.Subscription> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		limit: 1,
	});
	const sub = subs.data[0];
	if (!sub) throw new Error(`Customer ${customerId} has no Stripe subs`);
	return sub;
};

test(`${chalk.yellowBright("isAutumnCheckoutSubscription: true for sub from Autumn checkout")}`, async () => {
	const customerId = "checkout-guard-positive";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const attachResult = await autumnV1.billing.attach(
		{ customer_id: customerId, product_id: pro.id },
		{ timeout: 0 },
	);
	expect(attachResult.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({ url: attachResult.payment_url! });
	await timeout(8000);

	const subscription = await getLatestStripeSubscription({ ctx, customerId });

	const isFromCheckout = await isAutumnCheckoutSubscription({
		stripeCli: ctx.stripeCli,
		subscription,
	});
	expect(isFromCheckout).toBe(true);
});

test(`${chalk.yellowBright("isAutumnCheckoutSubscription: false for sub created directly")}`, async () => {
	const customerId = "checkout-guard-negative";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const subscription = await getLatestStripeSubscription({ ctx, customerId });

	const isFromCheckout = await isAutumnCheckoutSubscription({
		stripeCli: ctx.stripeCli,
		subscription,
	});
	expect(isFromCheckout).toBe(false);
});
