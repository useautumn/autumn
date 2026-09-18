/**
 * Splitting a variant onto its own Stripe product so a coupon can target it
 * alone. Existing subscriptions keep the prices they were created with.
 */

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

const seedBaseWithPricedVariant = async ({
	autumn,
	baseId,
	variantId,
}: {
	autumn: { catalogV2: { update: (params: { plans: unknown[] }) => unknown } };
	baseId: string;
	variantId: string;
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Split Base",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
				variants: [{ variant_plan_id: variantId, name: "Split Variant" }],
			},
		],
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
	`${chalk.yellowBright("split variant: gives the variant its own Stripe product and leaves the base untouched")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "split-variant-basic",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
			],
			actions: [],
		});

		const baseId = `split_base_${Date.now()}`;
		const variantId = `split_variant_${Date.now()}`;
		await seedBaseWithPricedVariant({ autumn: autumnV2_3, baseId, variantId });

		const baseBefore = await getPlan({ ctx, planId: baseId });
		const variantBefore = await getPlan({ ctx, planId: variantId });
		expect(variantBefore.processor?.id).toBe(baseBefore.processor?.id);

		await splitVariantStripeProduct({ ctx, variantPlanId: variantId });

		const baseAfter = await getPlan({ ctx, planId: baseId });
		const variantAfter = await getPlan({ ctx, planId: variantId });

		expect(baseAfter.processor?.id).toBe(baseBefore.processor?.id);
		expect(variantAfter.processor?.id).toBeTruthy();
		expect(variantAfter.processor?.id).not.toBe(baseAfter.processor?.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("split variant: a coupon created after the split scopes to the variant only")}`,
	async () => {
		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
			customerId: "split-variant-coupon",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
			],
			actions: [],
		});

		const baseId = `split_cpn_base_${Date.now()}`;
		const variantId = `split_cpn_variant_${Date.now()}`;
		await seedBaseWithPricedVariant({ autumn: autumnV2_3, baseId, variantId });

		await splitVariantStripeProduct({ ctx, variantPlanId: variantId });

		const couponId = `split_cpn_${Date.now()}`;
		const params: CreateRewardParams = {
			coupon: {
				id: couponId,
				name: "Variant Only",
				type: RewardType.PercentageDiscount,
				value: 10,
				duration: { type: CouponDurationType.Months, length: 1 },
				plan_ids: [variantId],
				promo_codes: [],
			},
		};

		await autumnV2_2.post("/rewards.create", params);

		const variant = await getPlan({ ctx, planId: variantId });
		const base = await getPlan({ ctx, planId: baseId });

		const stripeCoupon = await ctx.stripeCli.coupons.retrieve(couponId, {
			expand: ["applies_to"],
		});

		expect(stripeCoupon.applies_to?.products).toContain(
			variant.processor?.id as string,
		);
		expect(stripeCoupon.applies_to?.products).not.toContain(
			base.processor?.id as string,
		);
	},
);
