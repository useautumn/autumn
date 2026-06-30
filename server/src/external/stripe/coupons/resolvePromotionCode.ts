import type { StripeDiscountWithCoupon } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

const assertNotMaxRedeemed = async ({
	stripeCli,
	code,
}: {
	stripeCli: Stripe;
	code: string;
}) => {
	const promos = await stripeCli.promotionCodes.list({ code, limit: 1 });
	const promo = promos.data[0];

	if (
		promo?.max_redemptions != null &&
		promo.times_redeemed >= promo.max_redemptions
	) {
		throw new RecaseError({
			message: `Promotion code "${code}" has reached its maximum number of redemptions`,
			code: ErrCode.ReferralCodeMaxRedemptionsReached,
			statusCode: 400,
		});
	}
};

/**
 * Resolves a human-readable promotion code string to a StripeDiscountWithCoupon.
 * Validates that the promotion code exists, is active, and its coupon is valid.
 * Stores the promotion code ID for proper attribution in checkout sessions.
 */
export const resolvePromotionCode = async ({
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
			await assertNotMaxRedeemed({ stripeCli, code });
			throw new RecaseError({
				message: `Promotion code not found or inactive: "${code}"`,
			});
		}

		const promo = promos.data[0];
		const couponRaw = promo.promotion.coupon;

		if (!couponRaw || typeof couponRaw === "string") {
			throw new RecaseError({
				message: `Could not resolve coupon for promotion code "${code}"`,
			});
		}

		if (!couponRaw.valid) {
			throw new RecaseError({
				message: `Coupon for promotion code "${code}" is no longer valid`,
			});
		}

		const [minimumCurrency, minimumCurrencyOption] = Object.entries(
			promo.restrictions?.currency_options ?? {},
		)[0] ?? [undefined, undefined];

		return {
			source: { coupon: couponRaw },
			promotionCodeId: promo.id,
			firstTimeTransaction: promo.restrictions?.first_time_transaction,
			minimumAmount:
				promo.restrictions?.minimum_amount ??
				minimumCurrencyOption?.minimum_amount,
			minimumAmountCurrency:
				promo.restrictions?.minimum_amount_currency ?? minimumCurrency,
		};
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		throw new RecaseError({
			message: `Invalid promotion code: "${code}"`,
		});
	}
};
