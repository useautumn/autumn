/**
 * TDD test for applying Stripe-only coupons at the customer level.
 *
 * The product/subscription-level path (resolveParamDiscounts -> resolveCoupon)
 * resolves a reward_id straight against Stripe, so a coupon that exists only in
 * Stripe can be attached to a subscription. The customer-level endpoint instead
 * resolved solely via rewardRepo, so Stripe-only coupons 404'd.
 *
 * Contract under test:
 *   New behaviors:
 *     - POST /customers/:customer_id/coupons/:coupon_id with a Stripe-only
 *       coupon id -> 200, discount lands on the Stripe customer
 *     - coupon id in neither Autumn nor Stripe -> error
 *     - coupon exists in Stripe but valid === false -> error
 *   Side effects:
 *     - Stripe customer carries discount.coupon.id === coupon_id
 *     - No row inserted into Autumn's rewards table
 *
 * Pre-impl red: handleAddCouponToCusV2 throws "Coupon <id> not found" because
 * rewardRepo.get misses for Stripe-only coupons.
 * Post-impl green: the handler falls back to resolveCoupon on a rewardRepo miss.
 */

import { expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { createPercentCoupon } from "../billing/utils/discounts/discountTestUtils.js";

/** Legacy Stripe API discounts expand `coupon`; modern ones expose `source.coupon` as an id. */
type LegacyStripeDiscount = { coupon?: Stripe.Coupon };

/**
 * The legacy Stripe API returns the customer discount with a fully expanded
 * `coupon` object; the modern one only returns `source.coupon` as an id.
 */
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

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Missing Stripe customer ID");

	const stripeCustomer =
		await legacyStripeCli.customers.retrieve(stripeCustomerId);

	if (stripeCustomer.deleted) throw new Error("Stripe customer was deleted");

	const legacyDiscount = stripeCustomer.discount as LegacyStripeDiscount | null;

	return legacyDiscount?.coupon;
};

test.concurrent(
	`${chalk.yellowBright("customer-coupon 1: applies a Stripe-only coupon to the customer")}`,
	async () => {
		const customerId = "cus-stripe-only-coupon-v3";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false, paymentMethod: "success" })],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 25 });

		// ── Contract assertion 1: the coupon exists only in Stripe ──────────
		const autumnReward = await rewardRepo.get({
			db: ctx.db,
			idOrInternalId: coupon.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(autumnReward).toBeFalsy();

		// ── Contract assertion 2: endpoint accepts the Stripe-only id ───────
		await autumnV1.post(`/customers/${customerId}/coupons/${coupon.id}`, {});

		// ── Contract assertion 3: discount lands on the Stripe customer ─────
		const appliedCoupon = await getStripeCustomerCoupon({ customerId });
		expect(appliedCoupon?.id).toBe(coupon.id);
		expect(appliedCoupon?.percent_off).toBe(25);

		// ── Contract assertion 4: no reward row was created in Autumn ───────
		const rewardAfter = await rewardRepo.get({
			db: ctx.db,
			idOrInternalId: coupon.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(rewardAfter).toBeFalsy();
	},
);

test.concurrent(
	`${chalk.yellowBright("customer-coupon 2: rejects a coupon id in neither Autumn nor Stripe")}`,
	async () => {
		const customerId = "cus-unknown-coupon";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// ── Contract assertion 5: unknown id is still an error ──────────────
		await expect(
			autumnV1.post(
				`/customers/${customerId}/coupons/coupon_does_not_exist_anywhere`,
				{},
			),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("customer-coupon 3: rejects a deleted Stripe coupon")}`,
	async () => {
		const customerId = "cus-deleted-coupon";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 15 });
		await stripeCli.coupons.del(coupon.id);

		// ── Contract assertion 6: invalid/deleted coupon is an error ────────
		await expect(
			autumnV1.post(`/customers/${customerId}/coupons/${coupon.id}`, {}),
		).rejects.toThrow();
	},
);
