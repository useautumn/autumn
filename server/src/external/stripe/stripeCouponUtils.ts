import RecaseError from "@/utils/errorUtils.js";
import {
  Coupon,
  CouponDurationType,
  DiscountType,
  ErrCode,
  FixedPriceConfig,
  Organization,
  Price,
  PriceType,
  Product,
  UsagePriceConfig,
} from "@autumn/shared";
import { Stripe } from "stripe";

const couponToStripeDuration = (coupon: Coupon) => {
  // if (
  //   coupon.duration_type === CouponDurationType.OneOff &&
  //   coupon.should_rollover
  // ) {
  //   return {
  //     duration: "forever",
  //   };
  // }

  switch (coupon.duration_type) {
    case CouponDurationType.Forever:
      return {
        duration: "forever",
      };
    case CouponDurationType.OneOff:
      return {
        duration: "once",
      };
    case CouponDurationType.Months:
      return {
        duration: "repeating",
        duration_in_months: coupon.duration_value,
      };
  }
};

const couponToStripeValue = ({
  coupon,
  org,
}: {
  coupon: Coupon;
  org: Organization;
}) => {
  if (coupon.discount_type === DiscountType.Percentage) {
    return {
      percent_off: coupon.discount_value,
    };
  } else {
    return {
      amount_off: Math.round(coupon.discount_value * 100),
      currency: org.default_currency,
    };
  }
};

export const createStripeCoupon = async ({
  coupon,
  stripeCli,
  org,
  prices,
}: {
  coupon: Coupon;
  stripeCli: Stripe;
  org: Organization;
  prices: (Price & { product: Product })[];
}) => {
  let stripeProdIds = prices.map((price) => {
    if (price.config!.type === PriceType.Fixed) {
      return price.product.processor?.id;
    } else {
      const config = price.config as UsagePriceConfig;
      return config.stripe_product_id;
    }
  });

  for (const promoCode of coupon.promo_codes) {
    try {
      const stripePromoCode = await stripeCli.promotionCodes.retrieve(
        promoCode.code
      );
      throw new RecaseError({
        message: `Promo code ${promoCode.code} already exists in Stripe`,
        code: ErrCode.PromoCodeAlreadyExistsInStripe,
      });
    } catch (error) {}
  }
  const stripeCoupon = await stripeCli.coupons.create({
    id: coupon.internal_id,
    ...(couponToStripeDuration(coupon) as any),
    ...(couponToStripeValue({ coupon, org }) as any),
    name: coupon.name,
    metadata: {
      autumn_internal_id: coupon.internal_id,
    },
    applies_to: !coupon.apply_to_all
      ? {
          products: stripeProdIds,
        }
      : undefined,
  });

  // Create promo codes
  for (const promoCode of coupon.promo_codes) {
    await stripeCli.promotionCodes.create({
      coupon: stripeCoupon.id,
      code: promoCode.code,
    });
  }
};
