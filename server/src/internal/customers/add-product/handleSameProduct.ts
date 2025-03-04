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
import { AttachParams } from "../products/AttachParams.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductService } from "../products/CusProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { pricesOnlyOneOff } from "@/internal/prices/priceUtils.js";
import {
  getStripeSubs,
  getUsageBasedSub,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { CustomerEntitlementService } from "../entitlements/CusEntitlementService.js";
import { Decimal } from "decimal.js";

const getOptionsToUpdate = (oldOptionsList: any[], newOptionsList: any[]) => {
  let differentOptionsExist = false;
  let optionsToUpdate = [];
  for (const newOptions of newOptionsList) {
    let internalFeatureId = newOptions.internal_feature_id;
    let existingOptions = oldOptionsList.find(
      (o: any) => o.internal_feature_id === internalFeatureId
    );

    if (existingOptions?.quantity !== newOptions.quantity) {
      optionsToUpdate.push({
        new: newOptions,
        old: existingOptions,
      });
    }
  }

  return optionsToUpdate;
};

const updateFeatureQuantity = async ({
  sb,
  org,
  customer,
  curCusProduct,
  optionsToUpdate,
}: {
  sb: SupabaseClient;
  org: Organization;
  customer: Customer;
  curCusProduct: FullCusProduct;
  optionsToUpdate: any[];
}) => {
  const stripeCli = createStripeCli({
    org,
    env: customer.env,
  });

  const stripeSubs = await getStripeSubs({
    stripeCli: stripeCli,
    subIds: curCusProduct.subscription_ids || [],
  });

  for (const options of optionsToUpdate) {
    const { new: newOptions, old: oldOptions } = options;
    const subToUpdate = await getUsageBasedSub({
      stripeCli: stripeCli,
      subIds: curCusProduct.subscription_ids || [],
      feature: {
        internal_id: newOptions.internal_feature_id,
        id: newOptions.feature_id,
      } as Feature,
      stripeSubs: stripeSubs,
    });

    if (!subToUpdate) {
      throw new RecaseError({
        message: `Failed to update quantity for ${newOptions.feature_id} to ${newOptions.quantity} -- couldn't find subscription`,
        code: ErrCode.InternalError,
        statusCode: 500,
      });
    }

    // Update subscription
    // Get price
    const relatedPrice = curCusProduct.customer_prices.find(
      (cusPrice: FullCustomerPrice) =>
        (cusPrice.price.config as UsagePriceConfig).internal_feature_id ==
        newOptions.internal_feature_id
    );

    let config = relatedPrice?.price.config as UsagePriceConfig;

    let subItem = subToUpdate?.items.data.find(
      (item: Stripe.SubscriptionItem) => item.price.id == config.stripe_price_id
    );

    if (!subItem) {
      // Create new subscription item
      subItem = await stripeCli.subscriptionItems.create({
        subscription: subToUpdate.id,
        price: config.stripe_price_id as string,
        quantity: newOptions.quantity,
      });

      console.log(
        `   ✅ Successfully created subscription item for feature ${newOptions.feature_id}: ${newOptions.quantity}`
      );
    } else {
      // Update quantity
      await stripeCli.subscriptionItems.update(subItem.id, {
        quantity: newOptions.quantity,
      });
      console.log(
        `   ✅ Successfully updated subscription item for feature ${newOptions.feature_id}: ${newOptions.quantity}`
      );
    }

    // Update cus ent
    let difference = newOptions.quantity - oldOptions.quantity;
    let cusEnt = curCusProduct.customer_entitlements.find(
      (cusEnt: FullCustomerEntitlement) =>
        cusEnt.entitlement.internal_feature_id == newOptions.internal_feature_id
    );

    if (cusEnt) {
      let updates: any = {
        balance: new Decimal(cusEnt?.balance || 0).plus(difference).toNumber(),
      };
      if (cusEnt.balances) {
        updates.balances = { ...cusEnt.balances };
        for (const [key, value] of Object.entries(cusEnt.balances)) {
          updates.balances[key] = {
            ...cusEnt.balances[key],
            balance: new Decimal(value.balance || 0)
              .plus(difference)
              .toNumber(),
          };
        }
      }
      await CustomerEntitlementService.update({
        sb,
        id: cusEnt.id,
        updates,
      });
    }
  }

  await CusProductService.update({
    sb,
    cusProductId: curCusProduct.id,
    updates: { options: optionsToUpdate },
  });
};

export const handleSameMainProduct = async ({
  sb,
  curScheduledProduct,
  curMainProduct,
  attachParams,
  res,
}: {
  sb: SupabaseClient;
  curScheduledProduct: any;
  curMainProduct: FullCusProduct;
  attachParams: AttachParams;
  res: any;
}) => {
  const { optionsList: newOptionsList, product, org, customer } = attachParams;
  // 1. Check if scheduled product exists or quantity is updated
  const diffQuantityExists = false;

  const optionsToUpdate = getOptionsToUpdate(
    curMainProduct.options,
    newOptionsList
  );

  if (optionsToUpdate.length === 0 || curScheduledProduct) {
    // Update options
    throw new RecaseError({
      message: `Customer already has product ${product.name}, can't attach again`,
      code: ErrCode.CustomerAlreadyHasProduct,
      statusCode: 400,
    });
  }

  let messages: string[] = [];
  if (curScheduledProduct) {
    // Delete scheduled product
    await CusProductService.deleteFutureProduct({
      sb,
      org,
      env: customer.env,
      internalCustomerId: customer.internal_id,
      productGroup: product.group,
    });

    messages.push(
      `Removed scheduled product ${curScheduledProduct.product.name}`
    );
  }

  // 2. Update quantities
  if (optionsToUpdate.length > 0) {
    await updateFeatureQuantity({
      sb,
      org,
      customer,
      curCusProduct: curMainProduct,
      optionsToUpdate,
    });

    for (const option of optionsToUpdate) {
      const { new: newOption, old: oldOption } = option;
      messages.push(
        `Successfully updated quantity for ${newOption.feature_id} from ${oldOption.quantity} to ${newOption.quantity}`
      );
    }
  }

  res.status(200).json({
    success: true,
    message: messages.join("\n"),
  });

  return {
    done: true,
    curCusProduct: curMainProduct,
  };
};

export const handleSameAddOnProduct = async ({
  sb,
  curSameProduct,
  curMainProduct,
  attachParams,
  res,
}: {
  sb: SupabaseClient;
  curSameProduct: FullCusProduct;
  curMainProduct: FullCusProduct;
  attachParams: AttachParams;
  res: any;
}) => {
  const { optionsList: newOptionsList, prices, product } = attachParams;

  if (pricesOnlyOneOff(prices)) {
    return {
      done: false,
      curCusProduct: curMainProduct,
    };
  }

  let optionsToUpdate = getOptionsToUpdate(
    curMainProduct.options,
    newOptionsList
  );

  if (optionsToUpdate.length === 0) {
    throw new RecaseError({
      message: `Customer already has add-on product ${product.name}, can't attach again`,
      code: ErrCode.CustomerAlreadyHasProduct,
      statusCode: 400,
    });
  }

  throw new RecaseError({
    message:
      "Updating add on product quantity is feature flagged -- please contact hey@useautumn to enable it for this account!",
    code: ErrCode.InternalError,
    statusCode: 500,
  });

  console.log("Updating add on product with new quantities:", optionsToUpdate);
  let messages: string[] = [];
  for (const option of optionsToUpdate) {
    messages.push(
      `Updated quantity for ${option.new.feature_id} to ${option.new.quantity}`
    );
  }

  res.status(200).json({
    success: true,
    message: messages.join("\n"),
  });

  return {
    done: true,
    curCusProduct: curMainProduct,
  };
};
