import { test } from "bun:test";
import {
	BillingInterval,
	CouponDurationType,
	ResetInterval,
	RewardType,
	rewards,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { logPlaybook, resetCatalogPlans } from "../utils/catalogScenario.js";

const baseId = "qa-cpn-legacy-base";
const variantId = "qa-cpn-legacy-variant";
const rewardId = "qa-cpn-legacy-coupon";

test(`${chalk.yellowBright("coupon-qa: coupon saved before grouping existed")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogPlans({ ctx, planIds: [baseId, variantId] });

	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "QA Legacy Base",
				price: { amount: 18, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 120,
						reset: { interval: ResetInterval.Month },
					},
				],
				variants: [{ variant_plan_id: variantId, name: "QA Legacy Variant" }],
			},
		],
	});

	// The API now refuses to create this state, so write it straight to the DB:
	// a coupon covering only the base while the variant shares its Stripe product.
	const base = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: baseId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await ctx.db.delete(rewards).where(eq(rewards.id, rewardId));
	await ctx.db.insert(rewards).values({
		internal_id: generateId("rew"),
		id: rewardId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: "QA Legacy Partial Coupon",
		type: RewardType.PercentageDiscount,
		promo_codes: [],
		discount_config: {
			discount_value: 25,
			duration_type: CouponDurationType.Months,
			duration_value: 3,
			apply_to_all: false,
			price_ids: base.prices.map((price) => price.id),
			product_ids: [baseId],
		},
	});

	logPlaybook({
		title: `${rewardId} covers only ${baseId}, but ${variantId} shares its Stripe product`,
		steps: [
			`This is the state two customers hit: the discount silently applied to the variant as well.`,
			`Products > Rewards > open "${rewardId}" for editing.`,
			`The Products selection must auto-expand to the whole group, showing "QA Legacy Base + 1 plan" rather than the base alone.`,
			`Save without other edits → it succeeds, and the stored coupon now covers both plans.`,
			`Re-run this file to recreate the partial state and check the expansion again.`,
		],
	});
});
