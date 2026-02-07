import {
	type AttachDiscount,
	ErrCode,
	RecaseError,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Resolves `discounts` param entries into validated Stripe coupon objects.
 * Accepts coupon IDs (passed directly) and human-readable promo code strings (resolved via Stripe API).
 */
export const resolveParamDiscounts = async ({
	stripeCli,
	discounts,
}: {
	stripeCli: Stripe;
	discounts: AttachDiscount[];
}): Promise<StripeDiscountWithCoupon[]> => {
	const resolved = await Promise.all(
		discounts.map((discount) => {
			if ("reward_id" in discount) {
				return resolveCoupon({ stripeCli, couponId: discount.reward_id });
			}
			return resolvePromotionCode({
				stripeCli,
				code: discount.promotion_code,
			});
		}),
	);

	// Deduplicate by coupon ID
	const seen = new Set<string>();
	return resolved.filter((d) => {
		const couponId = d.source.coupon.id;
		if (seen.has(couponId)) return false;
		seen.add(couponId);
		return true;
	});
};

const resolveCoupon = async ({
	stripeCli,
	couponId,
}: {
	stripeCli: Stripe;
	couponId: string;
}): Promise<StripeDiscountWithCoupon> => {
	try {
		const coupon = await stripeCli.coupons.retrieve(couponId);

		if (!coupon.valid) {
			throw new RecaseError({
				message: `Coupon "${couponId}" is no longer valid`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return { source: { coupon } };
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		throw new RecaseError({
			message: `Invalid coupon ID: "${couponId}"`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

const resolvePromotionCode = async ({
	stripeCli,
	code,
}: {
	stripeCli: Stripe;
	code: string;
}): Promise<StripeDiscountWithCoupon> => {
	try {
		const promos = await stripeCli.promotionCodes.list({
			code,
			active: true,
			limit: 1,
			expand: ["data.promotion.coupon"],
		});

		if (promos.data.length === 0) {
			throw new RecaseError({
				message: `Promotion code not found or inactive: "${code}"`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const promo = promos.data[0];
		const couponRaw = promo.promotion.coupon;

		if (!couponRaw || typeof couponRaw === "string") {
			throw new RecaseError({
				message: `Could not resolve coupon for promotion code "${code}"`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (!couponRaw.valid) {
			throw new RecaseError({
				message: `Coupon for promotion code "${code}" is no longer valid`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return { source: { coupon: couponRaw } };
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		throw new RecaseError({
			message: `Invalid promotion code: "${code}"`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
