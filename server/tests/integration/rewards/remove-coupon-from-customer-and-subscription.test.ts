/**
 * TDD test for removing coupons at the customer and subscription level.
 *
 * Coupons could be added at both levels but never removed: the update
 * subscription `discounts` param is additive-only (existing discounts are
 * always merged back in), and no customer-level removal route existed.
 *
 * Contract under test:
 *   New endpoints:
 *     - DELETE /customers/:customer_id/coupons
 *         -> 200, removes the customer-level Stripe discount
 *     - DELETE /customers/:customer_id/subscriptions/:subscription_id/coupons/:coupon_id
 *         -> 200, removes that coupon's discount from the subscription.
 *            Matches on the original coupon id so `_roll_` variants match.
 *   New behaviors:
 *     - customer has a discount -> removed, Stripe customer.discount is null
 *     - customer has no discount -> 200 no-op (idempotent)
 *     - unknown customer -> error
 *     - sub has the coupon -> removed, coupon absent from sub.discounts
 *     - sub has other coupons too -> only the targeted one removed
 *     - coupon not on the sub -> error
 *     - sub not belonging to the customer -> error
 *   Side effects:
 *     - Stripe discount object deleted; no Autumn rows touched
 *
 * Pre-impl red: every DELETE 404s because the routes are not registered.
 * Post-impl green: both handlers resolve the customer and delete the discount.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "../billing/utils/discounts/discountTestUtils.js";

/** Legacy Stripe API discounts expand `coupon`; modern ones expose `source.coupon` as an id. */
type LegacyStripeDiscount = { coupon?: Stripe.Coupon };

const getStripeCustomerId = async ({ customerId }: { customerId: string }) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Missing Stripe customer ID");

	return stripeCustomerId;
};

const getStripeCustomerCoupon = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const legacyStripeCli = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: true,
	});

	const stripeCustomerId = await getStripeCustomerId({ customerId });
	const stripeCustomer =
		await legacyStripeCli.customers.retrieve(stripeCustomerId);

	if (stripeCustomer.deleted) throw new Error("Stripe customer was deleted");

	const legacyDiscount = stripeCustomer.discount as LegacyStripeDiscount | null;

	return legacyDiscount?.coupon;
};

const applyCustomerCoupon = async ({
	customerId,
	couponId,
}: {
	customerId: string;
	couponId: string;
}) => {
	const legacyStripeCli = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: true,
	});

	const stripeCustomerId = await getStripeCustomerId({ customerId });
	await legacyStripeCli.rawRequest(
		"POST",
		`/v1/customers/${stripeCustomerId}`,
		{ coupon: couponId },
	);
};

const getSubscriptionCouponIds = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const { subscription } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts"],
	});

	return subscription.discounts.map((discount) =>
		typeof discount === "string" ? discount : discount.source.coupon,
	);
};

test.concurrent(
	`${chalk.yellowBright("remove-coupon 1: removes the customer-level discount")}`,
	async () => {
		const customerId = "rm-cus-coupon";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false, paymentMethod: "success" })],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 30 });
		await applyCustomerCoupon({ customerId, couponId: coupon.id });

		const before = await getStripeCustomerCoupon({ customerId });
		expect(before?.id).toBe(coupon.id);

		// ── Contract assertion 1: DELETE removes the customer discount ─────
		await autumnV1.delete(`/customers/${customerId}/coupons`);

		const after = await getStripeCustomerCoupon({ customerId });
		expect(after).toBeFalsy();

		// ── Contract assertion 2: idempotent when nothing is applied ───────
		await autumnV1.delete(`/customers/${customerId}/coupons`);
	},
);

test.concurrent(
	`${chalk.yellowBright("remove-coupon 2: rejects an unknown customer")}`,
	async () => {
		const customerId = "rm-cus-coupon-known";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// ── Contract assertion 3: unknown customer is an error ─────────────
		await expect(
			autumnV1.delete("/customers/rm-cus-does-not-exist/coupons"),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("remove-coupon 3: removes only the targeted subscription coupon")}`,
	async () => {
		const customerId = "rm-sub-coupon";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const target = await createPercentCoupon({ stripeCli, percentOff: 10 });
		const keep = await createPercentCoupon({ stripeCli, percentOff: 5 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [target.id, keep.id],
		});

		const before = await getSubscriptionCouponIds({ customerId });
		expect(before).toContain(target.id);
		expect(before).toContain(keep.id);

		// ── Contract assertion 4: DELETE removes the targeted coupon ───────
		await autumnV1.delete(
			`/customers/${customerId}/subscriptions/${subscription.id}/coupons/${target.id}`,
		);

		// ── Contract assertion 5: the other coupon is untouched ────────────
		const after = await getSubscriptionCouponIds({ customerId });
		expect(after).not.toContain(target.id);
		expect(after).toContain(keep.id);

		// ── Contract assertion 6: coupon no longer on the sub is an error ──
		await expect(
			autumnV1.delete(
				`/customers/${customerId}/subscriptions/${subscription.id}/coupons/${target.id}`,
			),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("remove-coupon 4: rejects a subscription not owned by the customer")}`,
	async () => {
		const customerId = "rm-sub-coupon-owner";
		const otherCustomerId = "rm-sub-coupon-other";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: pro.id, customerId: otherCustomerId }),
			],
		});

		const { stripeCli, subscription: otherSubscription } =
			await getStripeSubscription({ customerId: otherCustomerId });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 10 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: otherSubscription.id,
			couponIds: [coupon.id],
		});

		// ── Contract assertion 7: another customer's sub is an error ───────
		await expect(
			autumnV1.delete(
				`/customers/${customerId}/subscriptions/${otherSubscription.id}/coupons/${coupon.id}`,
			),
		).rejects.toThrow();

		// ── Contract assertion 8: the other customer's coupon survives ────
		const otherAfter = await getSubscriptionCouponIds({
			customerId: otherCustomerId,
		});
		expect(otherAfter).toContain(coupon.id);
	},
);
