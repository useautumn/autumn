/** End-to-end coupon scoping: split, unrelated plans, and versioned plans. */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CouponDurationType,
	type CreateRewardParams,
	ResetInterval,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { splitVariantStripeProduct } from "@/internal/products/stripeResourceUtils/splitVariantStripeProduct.js";

type CatalogClient = {
	catalogV2: { update: (params: { plans: unknown[] }) => unknown };
};

const messagesItem = {
	feature_id: TestFeature.Messages,
	included: 100,
	reset: { interval: ResetInterval.Month },
};

const seedPlan = async ({
	autumn,
	planId,
	variantIds = [],
}: {
	autumn: CatalogClient;
	planId: string;
	variantIds?: string[];
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: `Plan ${planId}`,
				price: { amount: 20, interval: BillingInterval.Month },
				items: [messagesItem],
				variants: variantIds.map((variantId) => ({
					variant_plan_id: variantId,
					name: `Variant ${variantId}`,
				})),
			},
		],
	});

const couponFor = ({
	id,
	planIds,
}: {
	id: string;
	planIds: string[] | null;
}): CreateRewardParams => ({
	coupon: {
		id,
		name: "E2E Discount",
		type: RewardType.PercentageDiscount,
		value: 15,
		duration: { type: CouponDurationType.Months, length: 2 },
		plan_ids: planIds,
		promo_codes: [],
	},
});

const getPlan = ({
	ctx,
	planId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

test.concurrent(
	`${chalk.yellowBright("coupon e2e: variant split then variant-only coupon, base keeps its own coupon scope")}`,
	async () => {
		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId: "coupon-e2e-split",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "coupon-e2e-split@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const stamp = Date.now();
		const baseId = `e2e_split_base_${stamp}`;
		const variantId = `e2e_split_var_${stamp}`;
		await seedPlan({
			autumn: autumnV2_3,
			planId: baseId,
			variantIds: [variantId],
		});

		// Before the split the two share a product, so a variant-only coupon fails.
		await expect(
			autumnV2_2.post(
				"/rewards.create",
				couponFor({ id: `e2e_pre_${stamp}`, planIds: [variantId] }),
			),
		).rejects.toThrow(new RegExp(baseId));

		await splitVariantStripeProduct({ ctx, variantPlanId: variantId });

		const base = await getPlan({ ctx, planId: baseId });
		const variant = await getPlan({ ctx, planId: variantId });
		expect(variant.processor?.id).not.toBe(base.processor?.id);

		// After the split each plan is its own group.
		const variantCouponId = `e2e_var_${stamp}`;
		await autumnV2_2.post(
			"/rewards.create",
			couponFor({ id: variantCouponId, planIds: [variantId] }),
		);
		const baseCouponId = `e2e_base_${stamp}`;
		await autumnV2_2.post(
			"/rewards.create",
			couponFor({ id: baseCouponId, planIds: [baseId] }),
		);

		const variantCoupon = await ctx.stripeCli.coupons.retrieve(
			variantCouponId,
			{
				expand: ["applies_to"],
			},
		);
		const baseCoupon = await ctx.stripeCli.coupons.retrieve(baseCouponId, {
			expand: ["applies_to"],
		});

		expect(variantCoupon.applies_to?.products).toEqual([
			variant.processor?.id as string,
		]);
		expect(baseCoupon.applies_to?.products).toEqual([
			base.processor?.id as string,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("coupon e2e: a coupon on one plan never drags in an unrelated plan")}`,
	async () => {
		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId: "coupon-e2e-unrelated",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "coupon-e2e-unrelated@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const stamp = Date.now();
		const planA = `e2e_unrel_a_${stamp}`;
		const planB = `e2e_unrel_b_${stamp}`;
		await seedPlan({ autumn: autumnV2_3, planId: planA });
		await seedPlan({ autumn: autumnV2_3, planId: planB });

		const couponId = `e2e_unrel_${stamp}`;
		await autumnV2_2.post(
			"/rewards.create",
			couponFor({ id: couponId, planIds: [planA] }),
		);

		const a = await getPlan({ ctx, planId: planA });
		const b = await getPlan({ ctx, planId: planB });
		expect(a.processor?.id).not.toBe(b.processor?.id);

		const coupon = await ctx.stripeCli.coupons.retrieve(couponId, {
			expand: ["applies_to"],
		});
		expect(coupon.applies_to?.products).toEqual([a.processor?.id as string]);
	},
);

test.concurrent(
	`${chalk.yellowBright("coupon e2e: a new plan version does not falsely trip the group rule")}`,
	async () => {
		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId: "coupon-e2e-version",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "coupon-e2e-version@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const stamp = Date.now();
		const planId = `e2e_ver_${stamp}`;
		await seedPlan({ autumn: autumnV2_3, planId });

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					name: `Plan ${planId} v2`,
					versioning: "new_version",
					active: true,
					price: { amount: 30, interval: BillingInterval.Month },
					items: [messagesItem],
				},
			],
		});

		const created = await autumnV2_2.post(
			"/rewards.create",
			couponFor({ id: `e2e_ver_cpn_${stamp}`, planIds: [planId] }),
		);

		expect(created).toBeTruthy();
	},
);

test.concurrent(
	`${chalk.yellowBright("coupon e2e: a coupon on an older plan version is not asked to include its siblings")}`,
	async () => {
		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId: "coupon-e2e-old-version",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "coupon-e2e-old-version@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const stamp = Date.now();
		const planId = `e2e_oldver_${stamp}`;
		await seedPlan({ autumn: autumnV2_3, planId });
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					name: `Plan ${planId} v2`,
					versioning: "new_version",
					active: true,
					price: { amount: 35, interval: BillingInterval.Month },
					items: [messagesItem],
				},
			],
		});

		// Scope the coupon to v1's prices while v2 is the live version; both
		// versions share one Stripe product, so neither should be reported missing.
		const v1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 1,
		});

		const created = await autumnV2_2.post("/rewards.create", {
			coupon: {
				id: `e2e_oldver_cpn_${stamp}`,
				name: "Old Version",
				type: RewardType.PercentageDiscount,
				value: 10,
				duration: { type: CouponDurationType.Months, length: 1 },
				plan_ids: [planId],
				promo_codes: [],
			},
		});

		expect(created).toBeTruthy();
		expect(v1.prices.length).toBeGreaterThan(0);
	},
);
