import {
  Customer,
  EntitlementWithFeature,
  ErrCode,
  Feature,
  FullCusProduct,
  FullCustomer,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { AttachParams, AttachResultSchema } from "../products/AttachParams.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductService } from "../products/CusProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";

import {
  getStripeSubs,
  getUsageBasedSub,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { CusEntService } from "../entitlements/CusEntitlementService.js";
import { Decimal } from "decimal.js";
import { cancelFutureProductSchedule } from "../change-product/scheduleUtils.js";
import {
  handleUpgrade,
  ProrationBehavior,
} from "../change-product/handleUpgrade.js";
import { fullCusProductToProduct } from "../products/cusProductUtils.js";

import { SuccessCode } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const getOptionsToUpdate = (
  oldOptionsList: any[],
  newOptionsList: any[],
) => {
  let optionsToUpdate = [];
  for (const newOptions of newOptionsList) {
    let internalFeatureId = newOptions.internal_feature_id;
    let existingOptions = oldOptionsList.find(
      (o: any) => o.internal_feature_id === internalFeatureId,
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
  db,
  org,
  customer,
  curCusProduct,
  optionsToUpdate,
}: {
  db: DrizzleCli;
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
      db,
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
    let cusEnt = curCusProduct.customer_entitlements.find(
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
    cusProductId: curCusProduct.id,
    updates: { options: optionsToUpdate.map((o) => o.new) },
  });
};

export const hasPricesChanged = ({
  oldPrices,
  newPrices,
}: {
  oldPrices: Price[];
  newPrices: Price[];
}) => {
  for (const price of oldPrices) {
    if (!newPrices.some((p) => p.id === price.id)) {
      return true;
    }
  }

  for (const price of newPrices) {
    if (!oldPrices.some((p) => p.id === price.id)) {
      return true;
    }
  }

  return false;
};

export const hasEntitlementsChanged = ({
  oldEntitlements,
  newEntitlements,
}: {
  oldEntitlements: EntitlementWithFeature[];
  newEntitlements: EntitlementWithFeature[];
}) => {
  for (const entitlement of oldEntitlements) {
    if (!newEntitlements.some((e) => e.id === entitlement.id)) {
      return true;
    }
  }

  for (const entitlement of newEntitlements) {
    if (!oldEntitlements.some((e) => e.id === entitlement.id)) {
      return true;
    }
  }

  return false;
};

export const handleSameMainProduct = async ({
  db,
  curScheduledProduct,
  curMainProduct,
  attachParams,
  isCustom,
  req,
  res,
}: {
  db: DrizzleCli;
  curScheduledProduct: any;
  curMainProduct: FullCusProduct;
  attachParams: AttachParams;
  isCustom?: boolean;
  req: any;
  res: any;
}) => {
  const logger = req.logtail;
  const { optionsList: newOptionsList, products, org, customer } = attachParams;

  let product = products[0];

  const optionsToUpdate = getOptionsToUpdate(
    curMainProduct.options,
    newOptionsList,
  );

  // If new version
  let isNewVersion = curMainProduct.product.version !== product.version;
  if (isNewVersion) {
    logger.info(`SCENARIO 1: UPDATE SAME PRODUCT (NEW VERSION)`);
    await handleUpgrade({
      req,
      res,
      attachParams,
      curCusProduct: curMainProduct,
      curFullProduct: fullCusProductToProduct(curMainProduct),
      newVersion: true,
      carryExistingUsages: true,
      prorationBehavior: ProrationBehavior.None,
    });
    return {
      done: true,
      curCusProduct: curMainProduct,
    };
  }
  // If is custom, and there's at least one different price / entitlement, allow update to current main product...

  if (isCustom) {
    let pricesChanged = hasPricesChanged({
      oldPrices: curMainProduct.customer_prices.map((p) => p.price),
      newPrices: attachParams.prices,
    });

    let entitlementsChanged = hasEntitlementsChanged({
      oldEntitlements: curMainProduct.customer_entitlements.map(
        (e) => e.entitlement,
      ),
      newEntitlements: attachParams.entitlements,
    });

    if (pricesChanged || entitlementsChanged) {
      logger.info(`SCENARIO 0: UPDATE SAME PRODUCT (CUSTOM)`);
      logger.info(
        `Prices changed: ${pricesChanged}, Entitlements changed: ${entitlementsChanged}`,
      );

      attachParams.isCustom = true;
      await handleUpgrade({
        req,
        res,
        attachParams,
        curCusProduct: curMainProduct,
        curFullProduct: fullCusProductToProduct(curMainProduct),
        hasPricesChanged: pricesChanged,
        carryExistingUsages: true,
        updateSameProduct: true,
      });
      return {
        done: true,
        curCusProduct: curMainProduct,
      };
    }
  }

  let isCanceled = notNullish(curMainProduct.canceled_at);

  if (optionsToUpdate.length === 0 && !curScheduledProduct && !isCanceled) {
    // Update options
    throw new RecaseError({
      message: `Customer already has product ${product.name}, can't attach again`,
      code: ErrCode.CustomerAlreadyHasProduct,
      statusCode: 400,
    });
  }

  let messages: string[] = [];

  // 1. Delete future product
  const stripeCli = createStripeCli({
    org,
    env: customer.env,
  });

  if (curScheduledProduct) {
    await cancelFutureProductSchedule({
      db,
      org,
      stripeCli,
      cusProducts: attachParams.cusProducts!,
      product: product,
      logger,
      env: customer.env,
      internalEntityId: curScheduledProduct.internal_entity_id,
    });

    // Delete scheduled product
    await CusProductService.delete({
      db,
      cusProductId: curScheduledProduct.id,
    });

    messages.push(
      `Removed scheduled product ${curScheduledProduct.product.name}`,
    );
  } else if (isCanceled) {
    for (const subId of curMainProduct.subscription_ids || []) {
      await stripeCli.subscriptions.update(subId, {
        cancel_at: null,
      });
    }

    let entities = attachParams.entities;
    let entity = curMainProduct.internal_entity_id
      ? entities.find(
          (e) => e.internal_id === curMainProduct.internal_entity_id,
        )
      : undefined;

    messages.push(
      `Successfully renewed product ${product.name}${
        entity ? ` for entity ${entity.name || entity.id}` : ""
      }`,
    );
  }

  // 2. Update quantities
  if (optionsToUpdate.length > 0) {
    await updateFeatureQuantity({
      db,
      org,
      customer,
      curCusProduct: curMainProduct,
      optionsToUpdate,
    });

    for (const option of optionsToUpdate) {
      const { new: newOption, old: oldOption } = option;
      messages.push(
        `Successfully updated quantity for ${newOption.feature_id} from ${oldOption.quantity} to ${newOption.quantity}`,
      );
    }
  }

  res.status(200).json(
    AttachResultSchema.parse({
      customer_id: customer.id,
      product_ids: products.map((p) => p.id),

      code: SuccessCode.RenewedProduct,
      message: `Successfully renewed product ${products
        .map((p) => p.name)
        .join(", ")}`,
    }),
  );

  return {
    done: true,
    curCusProduct: curMainProduct,
  };
};
