import { expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { createPercentCoupon } from "../billing/utils/discounts/discountTestUtils.js";

type LegacyStripeDiscount = { coupon?: Stripe.Coupon };

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

		const autumnReward = await rewardRepo.get({
			db: ctx.db,
			idOrInternalId: coupon.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(autumnReward).toBeFalsy();

		await autumnV1.post(`/customers/${customerId}/coupons/${coupon.id}`, {});

		const appliedCoupon = await getStripeCustomerCoupon({ customerId });
		expect(appliedCoupon?.id).toBe(coupon.id);
		expect(appliedCoupon?.percent_off).toBe(25);

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

		await expect(
			autumnV1.post(`/customers/${customerId}/coupons/${coupon.id}`, {}),
		).rejects.toThrow();
	},
);
