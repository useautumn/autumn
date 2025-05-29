import RecaseError from "@/utils/errorUtils.js";
import {
  Reward,
  CouponDurationType,
  ErrCode,
  Organization,
  Price,
  PriceType,
  Product,
  UsagePriceConfig,
  RewardType,
} from "@autumn/shared";
import { Stripe } from "stripe";

const couponToStripeDuration = (coupon: Reward) => {
  let discountConfig = coupon.discount_config;
  // if (coupon.type == RewardType.InvoiceCredits) {
  //   return {
  //     duration: "forever",
  //   };
  // }

  switch (discountConfig!.duration_type) {
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
        duration_in_months: discountConfig!.duration_value,
      };
  }
};

const couponToStripeValue = ({
  reward,
  org,
}: {
  reward: Reward;
  org: Organization;
}) => {
  let discountConfig = reward.discount_config;
  if (reward.type === RewardType.PercentageDiscount) {
    return {
      percent_off: discountConfig!.discount_value,
    };
  } else if (
    reward.type === RewardType.FixedDiscount ||
    reward.type === RewardType.InvoiceCredits
  ) {
    return {
      amount_off: Math.round(discountConfig!.discount_value * 100),
      currency: org.default_currency,
    };
  }
};

export const createStripeCoupon = async ({
  reward,
  stripeCli,
  org,
  prices,
  logger,
}: {
  reward: Reward;
  stripeCli: Stripe;
  org: Organization;
  prices: (Price & { product: Product })[];
  logger: any;
}) => {
  let discountConfig = reward.discount_config;

  let stripeProdIds = prices.map((price) => {
    if (price.config!.type === PriceType.Fixed) {
      return price.product.processor?.id;
    } else {
      const config = price.config as UsagePriceConfig;
      if (!config.stripe_product_id) {
        logger.warn("No stripe product id for price", { price });
        logger.warn("Config", { config });
        throw new RecaseError({
          message: `No stripe product id for price ${price.id}`,
          code: ErrCode.InternalError,
        });
      }

      return config.stripe_product_id;
    }
  });

  for (const promoCode of reward.promo_codes) {
    try {
      const stripePromoCode = await stripeCli.promotionCodes.retrieve(
        promoCode.code,
      );
      throw new RecaseError({
        message: `Promo code ${promoCode.code} already exists in Stripe`,
        code: ErrCode.PromoCodeAlreadyExistsInStripe,
      });
    } catch (error) {}
  }

  const stripeCoupon = await stripeCli.coupons.create({
    // id: reward.internal_id,
    id: reward.id,
    ...(couponToStripeDuration(reward) as any),
    ...(couponToStripeValue({ reward, org }) as any),
    name: reward.name,
    metadata: {
      autumn_internal_id: reward.internal_id,
    },
    applies_to: !discountConfig!.apply_to_all
      ? {
          products: stripeProdIds,
        }
      : undefined,
  });

  // Create promo codes
  for (const promoCode of reward.promo_codes) {
    await stripeCli.promotionCodes.create({
      coupon: stripeCoupon.id,
      code: promoCode.code,
    });
  }
};
