import {
	type CreateReward,
	type CreateRewardParams,
	type CreateRewardResponse,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getApiCoupon } from "../../apiRewards/getApiCoupon.js";
import { createReward } from "../createReward.js";

type CouponParams = NonNullable<CreateRewardParams["coupon"]>;

const listCouponPlans = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[] | null;
}): Promise<FullProduct[]> => {
	if (planIds === null) return [];

	return ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: planIds,
	});
};

const couponToRewardData = ({
	coupon,
	plans,
}: {
	coupon: CouponParams;
	plans: FullProduct[];
}): CreateReward => ({
	id: coupon.id,
	name: coupon.name,
	type: coupon.type,
	promo_codes: coupon.promo_codes.map((promoCode) => ({
		code: promoCode.code,
		global_max_redemption: promoCode.global_max_redemption ?? undefined,
		first_time_transaction: promoCode.first_time_transaction ?? undefined,
	})),
	discount_config: {
		discount_value: coupon.value,
		duration_type: coupon.duration.type,
		duration_value: coupon.duration.length ?? 0,
		should_rollover: true,
		apply_to_all: coupon.plan_ids === null,
		price_ids: plans.flatMap(({ prices }) => prices.map(({ id }) => id)),
		product_ids: coupon.plan_ids ?? undefined,
	},
});

export const createApiCoupon = async ({
	ctx,
	coupon,
}: {
	ctx: AutumnContext;
	coupon: CouponParams;
}): Promise<CreateRewardResponse> => {
	const plans = await listCouponPlans({ ctx, planIds: coupon.plan_ids });
	const rewardData = couponToRewardData({ coupon, plans });
	const [reward] = await createReward({ ctx, rewardData });

	return {
		coupon: getApiCoupon({
			reward,
			planIdByInternalProductId: new Map(
				plans.map(({ internal_id, id }) => [internal_id, id]),
			),
			internalProductIdByPriceId: new Map(
				plans.flatMap(({ internal_id, prices }) =>
					prices.map(({ id }) => [id, internal_id] as const),
				),
			),
		}),
	};
};
