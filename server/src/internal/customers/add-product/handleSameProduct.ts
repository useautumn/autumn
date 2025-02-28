import {
  Customer,
  ErrCode,
  Feature,
  FullCusProduct,
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

const getOptionsToUpdate = (oldOptionsList: any[], newOptionsList: any[]) => {
  let differentOptionsExist = false;
  let optionsToUpdate = [];
  for (const newOptions of newOptionsList) {
    let internalFeatureId = newOptions.internal_feature_id;
    let existingOptions = oldOptionsList.find(
      (o: any) => o.internal_feature_id === internalFeatureId
    );

    if (existingOptions?.quantity !== newOptions.quantity) {
      optionsToUpdate.push(newOptions);
    }
  }

  return optionsToUpdate;
};

const updateFeatureQuantity = async ({
  sb,
  org,
  customer,
  curMainProduct,
  optionsToUpdate,
}: {
  sb: SupabaseClient;
  org: Organization;
  customer: Customer;
  curMainProduct: FullCusProduct;
  optionsToUpdate: any[];
}) => {
  const stripeCli = await createStripeCli({
    org,
    env: customer.env,
  });

  const stripeSubs = await getStripeSubs({
    stripeCli: stripeCli,
    subIds: curMainProduct.subscription_ids || [],
  });

  for (const options of optionsToUpdate) {
    const subToUpdate = await getUsageBasedSub({
      stripeCli: stripeCli,
      subIds: curMainProduct.subscription_ids || [],
      feature: {
        internal_id: options.internal_feature_id,
        id: options.feature_id,
      } as Feature,
      stripeSubs: stripeSubs,
    });

    if (!subToUpdate) {
      throw new RecaseError({
        message: `Failed to update quantity for ${options.feature_id} to ${options.quantity} -- couldn't find subscription`,
        code: ErrCode.InternalError,
        statusCode: 500,
      });
    }

    // Update subscription
    // Get price
    const relatedPrice = curMainProduct.customer_prices.find(
      (cusPrice: FullCustomerPrice) =>
        (cusPrice.price.config as UsagePriceConfig).internal_feature_id ==
        options.internal_feature_id
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
        quantity: options.quantity,
      });

      console.log(
        `   ✅ Successfully created subscription item for feature ${options.feature_id}: ${options.quantity}`
      );
    } else {
      // Update quantity
      await stripeCli.subscriptionItems.update(subItem.id, {
        quantity: options.quantity,
      });
      console.log(
        `   ✅ Successfully updated subscription item for feature ${options.feature_id}: ${options.quantity}`
      );
    }
  }

  await CusProductService.update({
    sb,
    cusProductId: curMainProduct.id,
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
      curMainProduct,
      optionsToUpdate,
    });

    for (const option of optionsToUpdate) {
      messages.push(
        `Successfully updated quantity for ${option.feature_id} to ${option.quantity}`
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
      `Updated quantity for ${option.feature_id} to ${option.quantity}`
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
