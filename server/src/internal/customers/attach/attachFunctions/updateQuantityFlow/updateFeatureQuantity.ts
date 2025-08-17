import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import {
  ErrCode,
  Feature,
  FeatureOptions,
  FullCusProduct,
  OnDecrease,
  OnIncrease,
  UsagePriceConfig,
} from "@autumn/shared";

import { Stripe } from "stripe";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import { shouldProrate } from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { handleQuantityUpgrade } from "./handleQuantityUpgrade.js";
import { Decimal } from "decimal.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";

const onDecreaseToStripeProration: Record<OnDecrease, string> = {
  [OnDecrease.ProrateImmediately]: "always_invoice",
  [OnDecrease.ProrateNextCycle]: "create_prorations",
  [OnDecrease.Prorate]: "create_prorations",
  [OnDecrease.None]: "none",
  [OnDecrease.NoProrations]: "none",
};

const handleQuantityDowngrade = async ({
  req,
  attachParams,
  cusProduct,
  stripeSubs,
  oldOptions,
  newOptions,
  subItem,
}: {
  req: any;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  oldOptions: FeatureOptions;
  newOptions: FeatureOptions;
  subItem: Stripe.SubscriptionItem;
}) => {
  const { db, logger } = req;
  const { stripeCli } = attachParams;

  const cusPrice = featureToCusPrice({
    internalFeatureId: newOptions.internal_feature_id!,
    cusPrices: cusProduct.customer_prices,
  })!;

  const onDecrease =
    cusPrice.price.proration_config?.on_decrease ||
    OnDecrease.ProrateImmediately;

  const stripeProration = onDecreaseToStripeProration[
    onDecrease
  ] as Stripe.SubscriptionItemUpdateParams.ProrationBehavior;

  logger.info(
    `Handling quantity downgrade for ${newOptions.feature_id}, on decrease: ${onDecrease}, proration: ${stripeProration}`
  );

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: newOptions.quantity,
    proration_behavior: stripeProration,
  });

  if (!shouldProrate(onDecrease)) {
    newOptions.upcoming_quantity = newOptions.quantity;
    newOptions.quantity = oldOptions.quantity;
  } else {
    const cusEnt = getRelatedCusEnt({
      cusPrice,
      cusEnts: cusProduct.customer_entitlements,
    });

    if (cusEnt) {
      const config = cusPrice.price.config as UsagePriceConfig;
      const billingUnits = config.billing_units || 1;
      let decrementBy = new Decimal(oldOptions.quantity)
        .minus(new Decimal(newOptions.quantity))
        .mul(billingUnits)
        .toNumber();

      await CusEntService.decrement({
        db,
        id: cusEnt.id,
        amount: decrementBy,
      });
    }
  }
};

export const handleUpdateFeatureQuantity = async ({
  req,
  attachParams,
  cusProduct,
  stripeSubs,
  oldOptions,
  newOptions,
}: {
  req: any;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  oldOptions: FeatureOptions;
  newOptions: FeatureOptions;
}) => {
  const { db, logger } = req;
  const { stripeCli } = attachParams;

  const prorationBehavior = "always_invoice";

  const subToUpdate = await getUsageBasedSub({
    db,
    stripeCli: stripeCli,
    subIds: cusProduct.subscription_ids || [],
    feature: {
      internal_id: newOptions.internal_feature_id,
      id: newOptions.feature_id,
    } as Feature,
    stripeSubs: stripeSubs,
  });

  const cusPrice = featureToCusPrice({
    internalFeatureId: newOptions.internal_feature_id!,
    cusPrices: cusProduct.customer_prices,
  })!;

  const price = cusPrice.price;

  if (!subToUpdate) {
    throw new RecaseError({
      message: `Failed to update prepaid quantity for ${newOptions.feature_id} because no subscription found`,
      code: ErrCode.InternalError,
      statusCode: 500,
    });
  }

  let subItem = findStripeItemForPrice({
    price: price!,
    stripeItems: subToUpdate.items.data,
  }) as Stripe.SubscriptionItem;

  // const config = price.config as UsagePriceConfig;
  // let difference = new Decimal(newOptions.quantity)
  //   .minus(new Decimal(oldOptions.quantity))
  //   .mul(config.billing_units || 1);

  // let cusEnt = getRelatedCusEnt({
  //   cusPrice,
  //   cusEnts: cusProduct.customer_entitlements,
  // });

  // if (cusEnt) {
  //   await CusEntService.increment({
  //     db,
  //     id: cusEnt.id,
  //     amount: difference.toNumber(),
  //   });
  // }

  if (newOptions.quantity < oldOptions.quantity) {
    return await handleQuantityDowngrade({
      req,
      attachParams,
      cusProduct,
      stripeSubs,
      oldOptions,
      newOptions,
      subItem,
    });
  } else {
    return await handleQuantityUpgrade({
      req,
      attachParams,
      cusProduct,
      stripeSubs,
      oldOptions,
      newOptions,
      cusPrice,
      stripeSub: subToUpdate,
      subItem,
    });
  }

  // if (!price) {
  //   throw new RecaseError({
  //     message: `updateFeatureQuantity: No price found for feature ${newOptions.feature_id}`,
  //     code: ErrCode.PriceNotFound,
  //   });
  // }

  // if (!subItem) {
  //   subItem = await stripeCli.subscriptionItems.create({
  //     subscription: subToUpdate.id,
  //     price: price.config.stripe_price_id as string,
  //     quantity: newOptions.quantity,
  //     proration_behavior: prorationBehavior,
  //     payment_behavior: "error_if_incomplete",
  //   });

  //   logger.info(
  //     `updateFeatureQuantity: Successfully created sub item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
  //   );
  // } else {
  //   await stripeCli.subscriptionItems.update(subItem.id, {
  //     quantity: newOptions.quantity,
  //     proration_behavior: prorationBehavior,
  //     payment_behavior: "error_if_incomplete",
  //   });
  //   logger.info(
  //     `updateFeatureQuantity: Successfully updated sub item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
  //   );
  // }
};
