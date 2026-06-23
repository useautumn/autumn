import {
	type ApiCouponV0,
	CouponDurationType,
	getGlobalMaxRedemption,
	type Reward,
} from "@autumn/shared";

/** Maps a discount-category reward row to the V0 coupon shape (plan-id maps supplied by caller). */
export const getApiCoupon = ({
	reward,
	planIdByInternalProductId,
	internalProductIdByPriceId,
}: {
	reward: Reward;
	planIdByInternalProductId: Map<string, string>;
	internalProductIdByPriceId: Map<string, string>;
}): ApiCouponV0 => {
	const discountConfig = reward.discount_config;

	const durationType =
		discountConfig?.duration_type ?? CouponDurationType.OneOff;
	const length =
		durationType === CouponDurationType.Months
			? (discountConfig?.duration_value ?? null)
			: null;

	let planIds: string[] | null;
	if (discountConfig?.apply_to_all) {
		planIds = null;
	} else {
		const resolved = new Set<string>();
		for (const priceId of discountConfig?.price_ids ?? []) {
			const internalProductId = internalProductIdByPriceId.get(priceId);
			if (!internalProductId) {
				continue;
			}
			const planId = planIdByInternalProductId.get(internalProductId);
			if (planId) {
				resolved.add(planId);
			}
		}
		planIds = [...resolved];
	}

	return {
		id: reward.id,
		name: reward.name,
		// caller (listApiRewards) only passes discount-category rewards
		type: reward.type as ApiCouponV0["type"],
		value: discountConfig?.discount_value ?? 0,
		duration: {
			type: durationType,
			length,
		},
		plan_ids: planIds,
		promo_codes: reward.promo_codes.map((promoCode) => ({
			code: promoCode.code,
			global_max_redemption: getGlobalMaxRedemption(promoCode) ?? null,
			first_time_transaction: promoCode.first_time_transaction ?? false,
		})),
		created_at: reward.created_at,
	};
};
