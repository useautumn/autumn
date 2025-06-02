import { DrizzleCli } from "@/db/initDrizzle.js";

import {
  getStripeSubs,
  getUsageBasedSub,
} from "@/external/stripe/stripeSubUtils.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  Customer,
  ErrCode,
  Feature,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { Stripe } from "stripe";

export const updateFeatureQuantity = async ({
  db,
  stripeCli,
  cusProduct,
  optionsToUpdate,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  cusProduct: FullCusProduct;
  optionsToUpdate: any[];
}) => {
  const stripeSubs = await getStripeSubs({
    stripeCli: stripeCli,
    subIds: cusProduct.subscription_ids || [],
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

    // Update subscription
    // Get price
    const relatedPrice = cusProduct.customer_prices.find(
      (cusPrice: FullCustomerPrice) =>
        (cusPrice.price.config as UsagePriceConfig).internal_feature_id ==
        newOptions.internal_feature_id,
    );

    let config = relatedPrice?.price.config as UsagePriceConfig;

    let subItem = subToUpdate?.items.data.find(
      (item: Stripe.SubscriptionItem) =>
        item.price.id == config.stripe_price_id,
    );

    if (!subItem) {
      // Create new subscription item
      subItem = await stripeCli.subscriptionItems.create({
        subscription: subToUpdate.id,
        price: config.stripe_price_id as string,
        quantity: newOptions.quantity,
      });

      console.log(
        `   ✅ Successfully created subscription item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
      );
    } else {
      // Update quantity
      await stripeCli.subscriptionItems.update(subItem.id, {
        quantity: newOptions.quantity,
      });
      console.log(
        `   ✅ Successfully updated subscription item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
      );
    }

    // Update cus ent
    let difference = newOptions.quantity - oldOptions.quantity;
    let cusEnt = cusProduct.customer_entitlements.find(
      (cusEnt: FullCustomerEntitlement) =>
        cusEnt.entitlement.internal_feature_id ==
        newOptions.internal_feature_id,
    );

    if (cusEnt) {
      let updates: any = {
        balance: new Decimal(cusEnt?.balance || 0).plus(difference).toNumber(),
      };

      await CusEntService.update({
        db,
        id: cusEnt.id,
        updates,
      });
    }
  }

  await CusProductService.update({
    db,
    cusProductId: cusProduct.id,
    updates: { options: optionsToUpdate.map((o) => o.new) },
  });
};
