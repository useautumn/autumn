/**
 * Coupons on plans that were never pushed to Stripe.
 *
 * Red (current):  createReward throws product_not_in_stripe, because
 *                 initRewardStripePrices guards on stripe_price_id and
 *                 initProductInStripe returns early on AppEnv.Live.
 * Green (after):  the Stripe product is created on the spot and the coupon
 *                 is scoped to it.
 */

import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateRewardParams,
	CreateRewardResponseSchema,
	RewardType,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

const couponParams = ({
	id,
	planIds,
}: {
	id: string;
	planIds: string[];
}): CreateRewardParams => ({
	coupon: {
		id,
		name: "Lazy Init Discount",
		type: RewardType.PercentageDiscount,
		value: 20,
		duration: { type: CouponDurationType.Months, length: 1 },
		plan_ids: planIds,
		promo_codes: [],
	},
});

const expectPlanLiveInStripe = async ({
	ctx,
	planId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
}) => {
	const plan = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeProductId = plan.processor?.id;
	expect(stripeProductId).toBeTruthy();

	const stripeProduct = await ctx.stripeCli.products.retrieve(
		stripeProductId as string,
	);
	expect(stripeProduct.deleted).toBeFalsy();

	return stripeProductId as string;
};

test.concurrent(
	`${chalk.yellowBright("rewards lazy stripe: creates the Stripe product for a plan absent from Stripe")}`,
	async () => {
		const pro = products.pro({
			id: "lazy-stripe-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "reward-lazy-create",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		const created = CreateRewardResponseSchema.parse(
			await autumnV2_2.post(
				"/rewards.create",
				couponParams({ id: `lazy_create_${Date.now()}`, planIds: [pro.id] }),
			),
		);

		expect(created.coupon?.plan_ids).toEqual([pro.id]);

		const stripeProductId = await expectPlanLiveInStripe({
			ctx,
			planId: pro.id,
		});

		const stripeCoupon = await ctx.stripeCli.coupons.retrieve(
			created.coupon?.id as string,
			{ expand: ["applies_to"] },
		);
		expect(stripeCoupon.applies_to?.products).toEqual([stripeProductId]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards lazy stripe: updating a coupon onto an uninitialised plan creates it")}`,
	async () => {
		const pro = products.pro({
			id: "lazy-stripe-update-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const unseen = products.premium({
			id: "lazy-stripe-update-unseen",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "reward-lazy-update",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
				s.products({ list: [pro, unseen], createInStripe: false }),
			],
			actions: [],
		});

		const couponId = `lazy_update_${Date.now()}`;
		await autumnV2_2.post(
			"/rewards.create",
			couponParams({ id: couponId, planIds: [pro.id] }),
		);

		await autumnV2_2.post("/rewards.update", {
			reward_id: couponId,
			coupon: { plan_ids: [unseen.id] },
		});

		const stripeProductId = await expectPlanLiveInStripe({
			ctx,
			planId: unseen.id,
		});

		const stripeCoupon = await ctx.stripeCli.coupons.retrieve(couponId, {
			expand: ["applies_to"],
		});
		expect(stripeCoupon.applies_to?.products).toEqual([stripeProductId]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards lazy stripe: usage-price coupon initialises the feature Stripe product")}`,
	async () => {
		const usagePlan = products.pro({
			id: "lazy-stripe-usage",
			items: [items.prepaidMessages({ billingUnits: 100, price: 5 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "reward-lazy-usage",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
				s.products({ list: [usagePlan], createInStripe: false }),
			],
			actions: [],
		});

		const couponId = `lazy_usage_${Date.now()}`;
		const created = CreateRewardResponseSchema.parse(
			await autumnV2_2.post(
				"/rewards.create",
				couponParams({ id: couponId, planIds: [usagePlan.id] }),
			),
		);

		expect(created.coupon?.plan_ids).toEqual([usagePlan.id]);

		const stripeCoupon = await ctx.stripeCli.coupons.retrieve(couponId, {
			expand: ["applies_to"],
		});
		expect(stripeCoupon.applies_to?.products?.length).toBeGreaterThan(0);
	},
);
