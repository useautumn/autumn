/**
 * Billing Verify: an unlinked active Stripe subscription that costs the
 * customer their plan is an error, not a warning.
 *
 * Contract under test (billingActions.verify):
 *   New types/fields:
 *     - SubscriptionMismatch "plan_on_ending_subscription"
 *       { ending_subscription_id } — severity "error".
 *   New behaviors:
 *     - An active Stripe sub is unlinked while the customer's main plan is
 *       linked to a different sub that is set to cancel
 *       -> plan_on_ending_subscription on the unlinked sub.
 *     - An active Stripe sub is unlinked and the customer holds no paid
 *       recurring plan -> stripe_sub_not_in_autumn at severity "error".
 *   Unchanged (billing-verify-severity 1): a Stripe-only sub beside a healthy
 *   paid plan stays a warning.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { listActiveStripeSubscriptions } from "../restore/utils/corruptStripeSubscription";

const UNMATCHED_PRICE = {
	currency: "usd",
	recurring: { interval: "month" as const },
	unit_amount: 4242,
};

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked 1: plan linked to a canceling sub while an active sub is unlinked -> plan_on_ending_subscription error")}`,
	async () => {
		const customerId = "verify-plan-on-ending-sub";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id as string;
		const [activeSubscription] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `${customerId} ending sub`,
		});
		const endingSubscription = await ctx.stripeCli.subscriptions.create({
			customer: stripeCustomerId,
			items: [
				{ price_data: { ...UNMATCHED_PRICE, product: stripeProduct.id } },
			],
			cancel_at_period_end: true,
		});

		// The state a subscription takeover leaves behind: the plan now hangs
		// off the canceling sub and the paying sub is unlinked.
		const planCustomerProduct = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product_id === pro.id,
		);
		await CusProductService.update({
			ctx,
			cusProductId: planCustomerProduct?.id as string,
			updates: { subscription_ids: [endingSubscription.id] },
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		const unlinked = result.subscriptions.find(
			(subscription) =>
				subscription.stripe_subscription_id === activeSubscription?.id,
		);
		expect(unlinked?.status).toBe("mismatched");
		expect(unlinked?.mismatches).toMatchObject([
			{
				type: "plan_on_ending_subscription",
				severity: "error",
				ending_subscription_id: endingSubscription.id,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked 2: active Stripe sub while the customer holds no paid plan -> stripe_sub_not_in_autumn error")}`,
	async () => {
		const customerId = "verify-paying-without-plan";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeProduct = await ctx.stripeCli.products.create({
			name: `${customerId} unlinked sub`,
		});
		const unlinkedSubscription = await ctx.stripeCli.subscriptions.create({
			customer: fullCustomer.processor?.id as string,
			items: [
				{ price_data: { ...UNMATCHED_PRICE, product: stripeProduct.id } },
			],
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		const unlinked = result.subscriptions.find(
			(subscription) =>
				subscription.stripe_subscription_id === unlinkedSubscription.id,
		);
		expect(unlinked?.mismatches).toMatchObject([
			{ type: "stripe_sub_not_in_autumn", severity: "error" },
		]);
	},
);
