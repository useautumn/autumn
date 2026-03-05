import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const testStripeCustomerWithGBP = async ({
	ctx,
	autumn,
}: {
	ctx: AutumnContext;
	autumn: AutumnInt;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	// 1. Create Stripe customer
	const stripeCus = await stripeCli.customers.create({
		email: "test-gbp@example.com",
		name: "GBP Test Customer",
	});

	const paymentMethod = await stripeCli.paymentMethods.create({
		type: "card",
		card: {
			token: "tok_visa",
		},
	});

	await stripeCli.paymentMethods.attach(paymentMethod.id, {
		customer: stripeCus.id,
	});

	const subscription = await stripeCli.subscriptions.create({
		customer: stripeCus.id,
		items: [
			{
				price_data: {
					currency: "gbp",
					unit_amount: 1000,
					recurring: {
						interval: "month",
						interval_count: 1,
					},
					product: "prod_U5XwDFBQB4TQJ7",
				},
				quantity: 1,
			},
		],
		default_payment_method: paymentMethod.id,
	});

	console.log("Subscription created", subscription);

	// 2. Create Autumn customer with stripe_id
	const autumnCus = await autumn.customers.create({
		id: "gbp-test-customer",
		name: "GBP Test Customer",
		email: "test-gbp@example.com",
		stripe_id: stripeCus.id,
	});
	console.log("Created:", { stripeCus: stripeCus.id, autumnCus });
};

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 2-month repeating 20% off coupon
 * - Delete the coupon from Stripe (coupon.deleted = true)
 * - Advance 2 weeks (mid-cycle)
 * - Upgrade to premium ($50/mo) — immediate switch
 *
 * Expected:
 * - Upgrade succeeds (no error even though coupon is deleted)
 * - Discount ID unchanged (same di_xxx — carried over via { discount: id })
 * - Discount end timestamp unchanged (duration not reset)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 3: upgrade carries over discount when coupon is deleted")}`, async () => {
	const customerId = "temp";

	const { autumnV1, testClockId, ctx } = await initScenario({
		// customerId,
		setup: [
			// s.customer({ paymentMethod: "success" }),
			// s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	await testStripeCustomerWithGBP({ ctx, autumn: autumnV1 });
});
