import { DrizzleCli } from "@/db/initDrizzle.js";

import {
  autumnToStripeProrationBehavior,
  getStripeSubs,
  getUsageBasedSub,
} from "@/external/stripe/stripeSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { findPriceForFeature } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  ErrCode,
  Feature,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { Stripe } from "stripe";
import { AttachConfig } from "../../models/AttachFlags.js";

export const updateFeatureQuantity = async ({
  db,
  stripeCli,
  cusProduct,
  optionsToUpdate,
  config,
  logger,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  cusProduct: FullCusProduct;
  optionsToUpdate: any[];
  config: AttachConfig;
  logger: any;
}) => {
  const stripeSubs = await getStripeSubs({
    stripeCli: stripeCli,
    subIds: cusProduct.subscription_ids || [],
  });

  const prorationBehavior = autumnToStripeProrationBehavior({
    prorationBehavior: config.proration,
  });

  for (const options of optionsToUpdate) {
    const { new: newOptions, old: oldOptions } = options;
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

    if (!subToUpdate) {
      throw new RecaseError({
        message: `Failed to update quantity for ${newOptions.feature_id} to ${newOptions.quantity}`,
        code: ErrCode.InternalError,
        statusCode: 500,
      });
    }

    const curPrices = cusProductToPrices({ cusProduct });
    const price = findPriceForFeature({
      prices: curPrices,
      internalFeatureId: newOptions.internal_feature_id,
    });

    if (!price) {
      throw new RecaseError({
        message: `updateFeatureQuantity: No price found for feature ${newOptions.feature_id}`,
        code: ErrCode.PriceNotFound,
      });
    }

    let subItem = findStripeItemForPrice({
      price,
      stripeItems: subToUpdate.items.data,
    });

    if (!subItem) {
      subItem = await stripeCli.subscriptionItems.create({
        subscription: subToUpdate.id,
        price: price.config.stripe_price_id as string,
        quantity: newOptions.quantity,
        proration_behavior: prorationBehavior,
        payment_behavior: "error_if_incomplete",
      });

      logger.info(
        `updateFeatureQuantity: Successfully created sub item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
      );
    } else {
      await stripeCli.subscriptionItems.update(subItem.id, {
        quantity: newOptions.quantity,
        proration_behavior: prorationBehavior,
        payment_behavior: "error_if_incomplete",
      });
      logger.info(
        `updateFeatureQuantity: Successfully updated sub item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
      );
    }

    // Update cus ent
    const config = price.config as UsagePriceConfig;
    let difference = new Decimal(newOptions.quantity)
      .minus(new Decimal(oldOptions.quantity))
      .mul(config.billing_units || 1);

    let cusEnt = cusProduct.customer_entitlements.find(
      (cusEnt: FullCustomerEntitlement) =>
        cusEnt.entitlement.internal_feature_id ==
        newOptions.internal_feature_id,
    );

    if (cusEnt) {
      await CusEntService.increment({
        db,
        id: cusEnt.id,
        amount: difference.toNumber(),
      });
    }
  }

  await CusProductService.update({
    db,
    cusProductId: cusProduct.id,
    updates: { options: optionsToUpdate.map((o) => o.new) },
  });
};
